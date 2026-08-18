/**
 * Client Admin Panel — design preview.
 *
 * Renders the client-provided admin UI prototype (ClientAdminPanel.jsx) as-is,
 * with its own mock data, so the design can be reviewed live in the app before
 * it's wired to the real backend. Standalone route — it brings its own full
 * sidebar/topbar chrome, so it is intentionally NOT under the (admin) layout.
 */
import ClientAdminPanel from "./ClientAdminPanel";

export const metadata = { title: "Admin UI Preview" };

export default function UiPreviewPage() {
  return <ClientAdminPanel />;
}
