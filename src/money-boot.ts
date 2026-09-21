import { NON_DOLLAR_REGIONS } from "./display-currency";
import { PENDING_GIFT_STORAGE_KEY } from "./pending-gift";

/**
 * The script that runs before the first paint, so nobody sees a figure that is about to change (D155).
 *
 * The page is static and drawn once for everybody: thirty dollars, in dollars. A device that kept a card, that chose
 * a currency, or that sits in a country whose currency is not the dollar is about to replace every figure on the
 * card the moment the page runs, and on a phone that moment comes a few hundred milliseconds after the paint. Until
 * then such a device saw "$30.00" and then its own card, which the founder read as the page loading twice.
 *
 * So the same trick as the appearance (src/theme.ts): before anything is painted, the device says whether its
 * figures are about to change, and the card keeps them out of sight until they have. A device with nothing kept and
 * nothing to convert sees the thirty dollars at once, because for it they are true. Inline and synchronous, as a
 * string, for the same reason as the theme's: React runs after the first paint, which is exactly too late.
 */
const KEPT_CURRENCY = "viky.displayCurrency";

export const MONEY_SETTLING = "data-money-settling";

export const MONEY_BOOT_SCRIPT = `try{var r=((navigator.language||"").split(/[-_]/)[1]||"").toUpperCase();if(localStorage.getItem(${JSON.stringify(PENDING_GIFT_STORAGE_KEY)})||sessionStorage.getItem(${JSON.stringify(KEPT_CURRENCY)})||${JSON.stringify(NON_DOLLAR_REGIONS)}.indexOf(r)>=0){document.documentElement.setAttribute(${JSON.stringify(MONEY_SETTLING)},"")}}catch(e){}`;
