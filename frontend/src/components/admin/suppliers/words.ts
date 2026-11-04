/**
 * What each supplier calls its login, and what its connection does.
 *
 * S&S is reached through its API with an account number and an API key, and
 * takes the store's orders. SanMar shares its catalogue as files on its SFTP
 * (backend services/sanmar_service), read with an FTP username and password:
 * products, prices and stock, with one stock figure for all its warehouses
 * together. Its order connection is not built yet.
 */
export interface SupplierWords {
  /** Short name in sentences: "S&S", "SanMar". */
  name: string;
  /** The login, in a sentence: "account number and API key". */
  login: string;
  user: { key: string; label: string; help: string; placeholder: string };
  secret: { key: string; label: string; help: string; placeholder: string };
  /** S&S Canada is a separate API; SanMar has no such choice. */
  country: boolean;
  /** Store orders can be sent to it. */
  orders: boolean;
  /** One stock figure for all its warehouses, nothing per warehouse to pick. */
  combinedStock: boolean;
}

const SS: SupplierWords = {
  name: "S&S",
  login: "account number and API key",
  user: { key: "account_number", label: "Username", help: "Your S&S account number.", placeholder: "e.g. 123456" },
  secret: {
    key: "api_key", label: "API Key", placeholder: "Paste your API key",
    help: "Don't have one? Email api@ssactivewear.com or contact your S&S rep.",
  },
  country: true,
  orders: true,
  combinedStock: false,
};

const SANMAR: SupplierWords = {
  name: "SanMar",
  login: "FTP username and password",
  user: {
    key: "ftp_username", label: "FTP Username", placeholder: "e.g. 123456",
    help: "Your SanMar FTP login, usually your SanMar customer number.",
  },
  secret: {
    key: "ftp_password", label: "Password", placeholder: "Paste your FTP password",
    help: "The FTP password SanMar gave you, not your sanmar.com password. Don't have one? Email sanmarintegrations@sanmar.com with your customer number and ask for the product data download.",
  },
  country: false,
  orders: false,
  combinedStock: true,
};

export function supplierWords(id: string): SupplierWords {
  return id === "sanmar" ? SANMAR : SS;
}
