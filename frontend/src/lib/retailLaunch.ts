/**
 * The Retail launch switch (specs/003-retail-launch, T605, the publish gate).
 *
 * Off until the manager has decided what the Retail pages may claim: then
 * /retail answers 404, Pricing has no Retail tab and no page links to either.
 * Set NEXT_PUBLIC_RETAIL_LAUNCH=1 in the website's environment to publish, at
 * the same time as the backend's Retail plan is made public (billing_plans).
 */
export const RETAIL_LAUNCHED = process.env.NEXT_PUBLIC_RETAIL_LAUNCH === "1";
