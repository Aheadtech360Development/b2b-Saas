/**
 * Where a button or link that goes nowhere ("#", or no address) leads on the
 * shop, by what it says. A shopper who presses a button should land
 * somewhere: designs brought in from elsewhere carry buttons that worked by
 * their own script (a code to copy, a size guide, a wishlist), and a demo
 * store full of buttons that do nothing does not look like a shop.
 */
export function whereWordsGo(words: string): string {
  const w = words.toLowerCase();
  if (/chat|help|support|question|talk to|contact|email us|call us/.test(w)) return "/contact";
  if (/track/.test(w)) return "/track-order";
  if (/gift card/.test(w)) return "/gift-cards";
  if (/return|exchange/.test(w)) return "/returns";
  if (/quote/.test(w)) return "/quote";
  if (/wishlist|saved|favou?rite|my account|sign in|log in|account/.test(w)) return "/account";
  if (/reward|points|refer/.test(w)) return "/account/rewards";
  return "/products";
}
