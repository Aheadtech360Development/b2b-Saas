"""Where a brand's reviews come from, besides the ones buyers write on its shop.

* Judge.me  — the review app most Shopify shops used. Every product and store
  review is imported with the brand's private API token and kept current
  (services/review_sources/judgeme.py).
* Google    — the brand's Google business: its rating, how many reviews, and the
  few reviews Google picks, read live and kept for a day at most
  (services/review_sources/google_place.py). A brand whose Business Profile is
  connected imports every review instead (services/google_reviews.py).
* Yelp      — the brand's Yelp page, and single reviews shown through Yelp's own
  embed (services/review_sources/yelp.py). Yelp's API may not be used for other
  businesses, so nothing of Yelp's is fetched or stored by us.

And the rules for reviews written on the shop: who may write one, whether a new
one waits for the shop's approval, and "Verified buyer" only for a buyer
(services/review_sources/rules.py).

Everything a brand sets lives in one tenant-namespaced settings row,
"review_sources" (services/review_sources/store.py).
"""
