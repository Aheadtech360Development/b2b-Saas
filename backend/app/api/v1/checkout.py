import logging
import traceback
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import ForbiddenError, ValidationError
from app.schemas.order import CheckoutConfirmRequest, CreatePaymentIntentRequest, OrderOut
from app.services.cart_service import CartService
from app.services.order_service import OrderService
from app.services.payment_service import PaymentService
from app.api.v1.discounts import validate_discount_code, compute_discount_amount
from app.models.discount import DiscountUsage

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/checkout", tags=["checkout"])


# ── Stripe: create payment intent ─────────────────────────────────────────────

@router.post("/intent")
async def create_payment_intent(
    payload: CreatePaymentIntentRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create a Stripe PaymentIntent for the current cart total.

    Direct charge on the brand's Connect account — money settles with the brand,
    who is merchant of record. The store must have finished Connect onboarding
    (charges_enabled); otherwise we refuse rather than route the payment to the
    wrong account.
    """
    company_id = getattr(request.state, "company_id", None)
    if not company_id:
        raise ForbiddenError("Company account required")

    tenant_id = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        raise ValidationError("No store context on this request")

    from app.services.connect_service import ConnectService
    try:
        connect = await ConnectService(db).get_status(str(tenant_id))
    except ValueError:
        raise ValidationError("Store not found")
    if not connect.get("charges_enabled"):
        raise HTTPException(
            status_code=409,
            detail={"code": "STORE_PAYMENTS_NOT_READY",
                    "message": "This store hasn't finished payment setup yet."},
        )
    connected_account_id = connect["account_id"]

    user_id = getattr(request.state, "user_id", None)
    account_type = getattr(request.state, "account_type", "wholesale")
    discount_percent = getattr(request.state, "tier_discount_percent", Decimal("0"))
    group_id = getattr(request.state, "discount_group_id", None)

    cart_svc = CartService(db)
    cart = await cart_svc.get_cart_with_pricing(company_id, discount_percent, group_id)
    if not cart.items:
        raise ValidationError("Cart is empty")

    # Compute the EXACT total the order will have (mirror OrderService.create_order),
    # so the charged amount == the final order total. The client sends the same
    # shipping_cost / tax_amount / discount_code here and to /checkout/confirm.
    if payload.shipping_method == "will_call":
        base_shipping = Decimal("0.00")
        expedited_surcharge = Decimal("0.00")
    else:
        base_shipping = Decimal(str(payload.shipping_cost)) if payload.shipping_cost else cart.validation.estimated_shipping
        expedited_surcharge = Decimal("45.00") if payload.shipping_method == "expedited" else Decimal("0")

    coupon_discount_amount = Decimal("0")
    if payload.discount_code:
        cart_total_for_coupon = float(cart.subtotal)
        coupon_dc, coupon_err = await validate_discount_code(
            payload.discount_code, cart_total_for_coupon, user_id, "wholesale", db
        )
        if coupon_err:
            raise ValidationError(f"Discount code invalid: {coupon_err}")
        coupon_discount_amount = Decimal(str(compute_discount_amount(coupon_dc, cart_total_for_coupon)))

    # Compute tax on the BACKEND from the ship-to address (never trust the client's
    # tax_amount). Tax applies to the discounted subtotal; shipping is not taxed.
    taxable_base = cart.subtotal - coupon_discount_amount
    tax_amount_dc = Decimal("0")
    if payload.to_state and taxable_base > 0:
        from app.services.tax_service import calculate_tax as _calc_tax
        _tax = await _calc_tax(
            to_state=payload.to_state,
            to_zip=payload.to_zip or "",
            to_city="",
            subtotal=float(taxable_base),
            shipping=0.0,
        )
        tax_amount_dc = Decimal(str(_tax.get("tax_amount", 0) or 0))

    convenience_fee = (
        (cart.subtotal * Decimal("0.03")).quantize(Decimal("0.01"))
        if (account_type == "wholesale" and (payload.payment_method or "card") == "card")
        else Decimal("0.00")
    )

    total = (cart.subtotal + base_shipping + expedited_surcharge + tax_amount_dc
             - coupon_discount_amount + convenience_fee).quantize(Decimal("0.01"))
    if total <= 0:
        raise ValidationError("Order total must be greater than zero")

    payment_svc = PaymentService(db)
    intent = await payment_svc.create_direct_payment_intent(
        amount_decimal=total,
        connected_account_id=connected_account_id,
        metadata={
            "company_id": str(company_id),
            "tenant_id": str(tenant_id),
            # The authoritative, server-computed tax — /checkout/confirm reads this
            # back so the order's tax matches exactly what was charged.
            "tax_amount": str(tax_amount_dc),
        },
    )

    return {
        "client_secret": intent.client_secret,
        "payment_intent_id": intent.id,
        "connected_account_id": connected_account_id,
        "publishable_key": settings.STRIPE_PUBLISHABLE_KEY,
        "amount": total,
    }


# ── QB Payments: server-side tokenize ────────────────────────────────────────

@router.post("/tokenize")
async def tokenize_card(
    payload: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Tokenize raw card data via QB Payments API and auto-save card to QB customer wallet.

    Expected payload: { card: { number, expMonth, expYear, cvc, name (opt), address: { postalCode } (opt) } }
    Returns: { "token": "<qb_one_time_token>" }

    ⚠ Production recommendation: use QB.js on the client to tokenize and skip
    this endpoint — it reduces PCI scope to SAQ A.
    """
    import logging as _logging
    _log = _logging.getLogger(__name__)

    company_id = getattr(request.state, "company_id", None)
    _log.info("tokenize_card called — company: %s (card save runs here, not at confirm)", company_id)

    from app.services.qb_payments_service import QBPaymentsService
    qb_pay = QBPaymentsService()
    try:
        card = payload["card"]
        token = qb_pay.create_token(
            card_number=card["number"],
            exp_month=card["expMonth"],
            exp_year=card["expYear"],
            cvc=card["cvc"],
            name=card.get("name"),
            postal_code=card.get("address", {}).get("postalCode"),
        )
    except KeyError as exc:
        raise ValidationError(f"Missing required card field: {exc}") from exc
    except RuntimeError as exc:
        raise ValidationError(str(exc)) from exc

    # Auto-save card to QB customer wallet — wholesale accounts only
    if not company_id:
        return {"token": token}

    try:
        from sqlalchemy import select as _select
        from app.models.company import Company as _Company
        company = (await db.execute(
            _select(_Company).where(_Company.id == company_id)
        )).scalar_one_or_none()
        _log.info("Card save attempt — company: %s, qb_customer_id: %s", company_id, company.qb_customer_id if company else None)
        if company:
            # QB Payments customer ID is always str(company_id) — derive directly,
            # never write to company.qb_customer_id (that column is for QB Accounting).
            qb_payments_cust_id = qb_pay.create_customer(str(company_id))
            _log.info("QB Payments customer ready: %s", qb_payments_cust_id)
            if qb_payments_cust_id:
                saved = qb_pay.save_card(
                    customer_id=qb_payments_cust_id,
                    card_number=card["number"],
                    exp_month=card["expMonth"],
                    exp_year=card["expYear"],
                    cvc=card["cvc"],
                    name=card.get("name"),
                )
                _log.info("Card save SUCCESS for company %s — card_id: %s", company_id, saved.get("id"))
                if saved.get("id") and not company.default_payment_method_id:
                    company.default_payment_method_id = saved["id"]
                await db.commit()
    except Exception as _exc:
        _log.warning("Card save FAILED for company %s: %s: %s", company_id, type(_exc).__name__, _exc)

    return {"token": token}


# ── Confirm order (QB Payments or Stripe) ─────────────────────────────────────

@router.post("/confirm", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def confirm_checkout(
    payload: CheckoutConfirmRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create order after payment authorisation.

    Supports two payment flows:
    - QB Payments: provide qb_token (one-time) or saved_card_id.
    - Stripe (legacy): provide payment_intent_id.

    Note: card auto-save happens at POST /checkout/tokenize (not here).
    """
    try:
        return await _confirm_checkout_inner(payload, request, db)
    except (ForbiddenError, ValidationError, HTTPException):
        raise  # let framework handle these as-is
    except Exception as exc:
        _log.exception("confirm_checkout UNHANDLED ERROR — payload fields: %s", getattr(payload, "__fields_set__", None))
        raise HTTPException(
            status_code=500,
            detail=f"Order creation failed: {type(exc).__name__}: {exc}",
        ) from exc


async def _confirm_checkout_inner(
    payload: CheckoutConfirmRequest,
    request: Request,
    db: AsyncSession,
):
    company_id = getattr(request.state, "company_id", None)
    user_id = getattr(request.state, "user_id", None)
    _account_type = getattr(request.state, "account_type", "wholesale")
    if not company_id:
        raise ForbiddenError("Company account required")

    _log.info(
        "confirm_checkout called — company: %s, fields_set: %s",
        company_id,
        payload.__fields_set__,
    )
    _log.info(
        "confirm_checkout payment — qb_token: %s, saved_card_id: %s, payment_intent_id: %s",
        bool(payload.qb_token),
        bool(payload.saved_card_id),
        bool(payload.payment_intent_id),
    )

    # Validate: at least one payment method supplied
    has_qb     = bool(payload.qb_token or payload.saved_card_id)
    has_stripe = bool(payload.payment_intent_id)
    has_ach    = payload.payment_method == "ach"
    has_net30  = payload.payment_method == "net_30"  # wholesale invoice/NET 30 — no upfront charge
    if not has_qb and not has_stripe and not has_ach and not has_net30:
        raise ValidationError(
            "Payment required: supply qb_token, saved_card_id, payment_intent_id, "
            "payment_method=ach, or payment_method=net_30"
        )

    # Validate Net 30 is explicitly enabled for this company
    if has_net30:
        from sqlalchemy import select as _sel
        from app.models.company import Company as _Company
        _company = (await db.execute(
            _sel(_Company).where(_Company.id == company_id)
        )).scalar_one_or_none()
        if not _company or not getattr(_company, "net30_enabled", False):
            raise ValidationError("Net 30 payment terms are not available for your account. Contact us to request Net 30.")

    # ── Stripe (Connect Direct charge): VERIFY the PaymentIntent server-side ───
    # Never trust the client's claim of payment. Retrieve the PaymentIntent on
    # THIS brand's connected account and require status=succeeded before creating
    # a paid order — otherwise a forged/unpaid intent id would mint a free order.
    if has_stripe:
        from sqlalchemy import select as _sel_pi
        from app.models.order import Order as _OrderPI
        from app.services.connect_service import ConnectService

        # Idempotency: one PaymentIntent maps to exactly one order.
        _existing = (await db.execute(
            _sel_pi(_OrderPI).where(_OrderPI.stripe_payment_intent_id == payload.payment_intent_id)
        )).scalar_one_or_none()
        if _existing:
            return _existing

        _tenant_id = getattr(request.state, "tenant_id", None)
        _connect = await ConnectService(db).get_status(str(_tenant_id)) if _tenant_id else {}
        _acct = _connect.get("account_id")
        if not _acct:
            raise ValidationError("This store is not set up for card payments.")
        import stripe as _stripe_lib
        _stripe_lib.api_key = settings.STRIPE_SECRET_KEY
        try:
            _pi = _stripe_lib.PaymentIntent.retrieve(payload.payment_intent_id, stripe_account=_acct)
        except Exception as _pi_exc:
            _log.warning("PI verify failed for %s on %s: %s", payload.payment_intent_id, _acct, _pi_exc)
            raise ValidationError("Could not verify your payment. Please contact the store.")
        if getattr(_pi, "status", None) != "succeeded":
            raise ValidationError("Payment was not completed. Please try again.")

        # Use the server-computed tax the PaymentIntent was created with, so the
        # order's tax matches the charge exactly (the client's tax_amount is ignored).
        _pi_tax = (getattr(_pi, "metadata", None) or {}).get("tax_amount")
        if _pi_tax is not None:
            try:
                payload.tax_amount = Decimal(str(_pi_tax))
            except Exception:
                pass

    discount_percent = getattr(request.state, "tier_discount_percent", Decimal("0"))
    group_id = getattr(request.state, "discount_group_id", None)

    # ── QB Payments flow ──────────────────────────────────────────────────────
    qb_charge_id: str | None = None
    qb_payment_status: str | None = None
    coupon_discount_dc = None
    coupon_discount_amount = Decimal("0")

    if has_qb:
        from app.services.cart_service import CartService as _CartService
        from app.services.qb_payments_service import QBPaymentsService

        cart_svc = _CartService(db)
        cart = await cart_svc.get_cart_with_pricing(company_id, discount_percent, group_id)
        if not cart.items:
            raise ValidationError("Cart is empty")

        if payload.shipping_method == "will_call":
            base_shipping = Decimal("0.00")
            expedited_surcharge = Decimal("0.00")
        else:
            base_shipping = Decimal(str(payload.shipping_cost)) if payload.shipping_cost else cart.validation.estimated_shipping
            expedited_surcharge = Decimal("45.00") if payload.shipping_method == "expedited" else Decimal("0")

        # Validate and apply discount code if provided
        if payload.discount_code:
            cart_total_for_coupon = float(cart.subtotal)  # discount applies to subtotal only, not shipping
            coupon_discount_dc, coupon_error = await validate_discount_code(
                payload.discount_code,
                cart_total_for_coupon,
                user_id,
                "wholesale",
                db,
            )
            if coupon_error:
                raise ValidationError(f"Discount code invalid: {coupon_error}")
            coupon_discount_amount = Decimal(str(
                compute_discount_amount(coupon_discount_dc, cart_total_for_coupon)
            ))

        tax_amount_dc = Decimal(str(payload.tax_amount or 0))
        _convenience_fee_dc = (cart.subtotal * Decimal("0.03")).quantize(Decimal("0.01")) if _account_type == "wholesale" else Decimal("0.00")
        total_float = float(cart.subtotal + base_shipping + expedited_surcharge + tax_amount_dc - coupon_discount_amount + _convenience_fee_dc)

        qb_pay = QBPaymentsService()
        try:
            if payload.saved_card_id:
                # Saved card — look up QB customer ID from DB (frontend doesn't need to pass it)
                from sqlalchemy import select as _select
                from app.models.company import Company as _Company
                company = (await db.execute(
                    _select(_Company).where(_Company.id == company_id)
                )).scalar_one_or_none()
                # QB Payments customer ID is always str(company_id)
                qb_cust_id = payload.qb_customer_id or str(company_id)
                if not qb_cust_id:
                    raise ValidationError(
                        "No QB Payments profile found. Complete a checkout with a new card first."
                    )
                charge_resp = qb_pay.charge_saved_card(
                    customer_id=qb_cust_id,
                    card_id=payload.saved_card_id,
                    amount=total_float,
                    description=f"Order — company {company_id}",
                )
            else:
                charge_resp = qb_pay.charge_card(
                    token=payload.qb_token,  # type: ignore[arg-type]
                    amount=total_float,
                    description=f"Order — company {company_id}",
                )
        except RuntimeError as exc:
            raise ValidationError(f"Payment failed: {exc}") from exc

        qb_charge_id = charge_resp.get("id")
        qb_payment_status = charge_resp.get("status", "UNKNOWN")


    # ── Create order record ───────────────────────────────────────────────────
    order_svc = OrderService(db)
    order = await order_svc.create_order(
        company_id=company_id,
        user_id=user_id,
        confirm=payload,
        discount_percent=discount_percent,
        qb_charge_id=qb_charge_id,
        qb_payment_status=qb_payment_status,
        coupon_discount_amount=coupon_discount_amount,
        group_id=group_id,
        is_wholesale=_account_type == "wholesale",
    )

    # Record coupon usage after order is created
    if coupon_discount_dc is not None and coupon_discount_amount > 0:
        usage = DiscountUsage(
            discount_code_id=coupon_discount_dc.id,
            order_id=order.id,
            user_id=user_id,
            discount_amount_applied=coupon_discount_amount,
        )
        db.add(usage)

    # ── Statement transactions ────────────────────────────────────────────────
    from datetime import date as _date
    from uuid import UUID as _UUID
    from app.models.statement import StatementTransaction

    _today = _date.today().isoformat()
    _company_uuid = _UUID(str(company_id))
    _order_total = float(order.total)

    db.add(StatementTransaction(
        company_id=_company_uuid,
        transaction_date=_today,
        description=f"Order {order.order_number}",
        transaction_type="charge",
        amount=_order_total,
        reference_number=order.order_number,
        order_id=order.id,
    ))

    if qb_payment_status == "CAPTURED" and qb_charge_id:
        db.add(StatementTransaction(
            company_id=_company_uuid,
            transaction_date=_today,
            description=f"Card payment for Order {order.order_number}",
            transaction_type="payment",
            amount=_order_total,
            reference_number=qb_charge_id,
            order_id=order.id,
        ))

    await db.commit()

    # ── Send order confirmation email ─────────────────────────────────────────
    try:
        from sqlalchemy import select as _sel
        from sqlalchemy.orm import selectinload as _sil
        from app.models.order import Order as _Order
        from app.models.user import User as _User
        from app.services.email_service import EmailService as _EmailSvc

        _order_full = (await db.execute(
            _sel(_Order).options(_sil(_Order.items)).where(_Order.id == order.id)
        )).scalar_one_or_none()

        if _order_full and user_id:
            _user = (await db.execute(
                _sel(_User).where(_User.id == user_id)
            )).scalar_one_or_none()
            if _user:
                _email_svc = _EmailSvc(db)
                _email_svc.send_order_confirmation(_order_full, _user.email)
                _email_svc.send_admin_new_order_alert(_order_full)
    except Exception as _exc:
        _log.warning("Order confirmation email failed: %s", _exc)

    # ── QB invoice sync ───────────────────────────────────────────────────────
    if settings.QUICKBOOKS_ENABLED:
        try:
            from app.tasks.quickbooks_tasks import sync_order_invoice_to_qb
            sync_order_invoice_to_qb.delay(str(order.id))
        except Exception as _exc:
            _log.warning("QB invoice sync dispatch failed: %s", _exc)

    return order
