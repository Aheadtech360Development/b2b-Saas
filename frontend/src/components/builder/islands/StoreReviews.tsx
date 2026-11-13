/**
 * "Reviews from…": the shop's own customers (and Judge.me), its Google
 * business, or its Yelp page, on any page. Set up in Marketing, Reviews.
 *
 * Each source is shown on its own and in its own words: Google's rating and
 * count are Google's, Yelp's reviews are drawn by Yelp. Nothing is mixed into
 * one average, and nothing is picked by its stars.
 */
import { Stars } from "./Reviews";
import YelpEmbeds from "./YelpEmbeds";
import { safeHref, safeSrc } from "@/lib/builder/sanitize";
import type { GooglePlaceInfo, ShopReviewItem, YelpInfo } from "@/lib/builder/types";

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

export function ShopReviewList({ id, heading, total, avg, items }: {
  id: string; heading: string; total: number; avg: number; items: ShopReviewItem[];
}) {
  return (
    <div data-b={id} className="b-srev" data-source="shop">
      <div className="b-rev-head">
        {heading && <h2 className="b-heading">{heading}</h2>}
        <div className="b-rev-sum">
          <Stars value={avg} /> <b>{avg.toFixed(1)}</b> <span className="b-rcount">· {plural(total, "review", "reviews")}</span>
        </div>
      </div>
      <ul className="b-srev-list">
        {items.map((r, i) => (
          <li key={i} className="b-srev-card">
            <div className="b-rev-top">
              <Stars value={r.rating} />
              {r.title && <b className="b-rev-title">{r.title}</b>}
            </div>
            <p className="b-rev-body">{r.body}</p>
            {safeSrc(r.image) && <img className="b-rev-img" src={r.image} alt="" loading="lazy" />}
            <div className="b-rev-by">
              {r.name}{r.verified ? " · Verified buyer" : ""}{r.date ? ` · ${r.date}` : ""}
            </div>
            {r.product && (
              r.productUrl ? <a className="b-srev-product" href={r.productUrl}>{r.product}</a>
                           : <span className="b-srev-product">{r.product}</span>
            )}
            {r.reply && <div className="b-rev-reply"><b>Reply from the shop</b><p>{r.reply}</p></div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GoogleReviewList({ id, heading, place, limit }: {
  id: string; heading: string; place: GooglePlaceInfo; limit: number;
}) {
  const maps = safeHref(place.maps_url ?? "");
  const rating = typeof place.rating === "number" ? place.rating : null;
  return (
    <div data-b={id} className="b-srev" data-source="google">
      <div className="b-rev-head">
        {heading && <h2 className="b-heading">{heading}</h2>}
        {rating !== null && (
          <a className="b-rev-sum" href={maps || undefined} target="_blank" rel="noopener noreferrer">
            <Stars value={rating} /> <b>{rating.toFixed(1)}</b>
            <span className="b-rcount">· {plural(place.total ?? 0, "review", "reviews")} on Google</span>
          </a>
        )}
      </div>
      {place.reviews.length > 0 && (
        <ul className="b-srev-list">
          {place.reviews.slice(0, Math.max(1, limit)).map((r, i) => {
            const author = safeHref(r.author_url ?? "");
            return (
              <li key={i} className="b-srev-card">
                <div className="b-rev-top">
                  <Stars value={r.rating} />
                  {r.when && <span className="b-rcount">{r.when}</span>}
                </div>
                {r.text && <p className="b-rev-body">{r.text}</p>}
                <div className="b-srev-author">
                  {safeSrc(r.author_photo ?? "") && (
                    <img src={r.author_photo!} alt="" width={28} height={28} loading="lazy" referrerPolicy="no-referrer" />
                  )}
                  {author ? <a href={author} target="_blank" rel="nofollow noopener noreferrer">{r.author}</a> : <span>{r.author}</span>}
                  {safeHref(r.report_url ?? "") && (
                    <a className="b-srev-report" href={r.report_url!} target="_blank" rel="nofollow noopener noreferrer">Report</a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="b-srev-credit">
        Reviews from {maps ? <a href={maps} target="_blank" rel="noopener noreferrer">Google Maps</a> : "Google Maps"}
      </p>
    </div>
  );
}

export function YelpReviewList({ id, heading, yelp, limit, edit }: {
  id: string; heading: string; yelp: YelpInfo; limit: number; edit?: boolean;
}) {
  const page = safeHref(yelp.url ?? "");
  return (
    <div data-b={id} className="b-srev" data-source="yelp">
      {heading && <div className="b-rev-head"><h2 className="b-heading">{heading}</h2></div>}
      {yelp.reviews.length > 0 && <YelpEmbeds reviews={yelp.reviews.slice(0, Math.max(1, limit))} edit={edit} />}
      {page && (
        <p className="b-srev-credit">
          <a href={page} target="_blank" rel="noopener noreferrer">Read our reviews on Yelp</a>
        </p>
      )}
    </div>
  );
}
