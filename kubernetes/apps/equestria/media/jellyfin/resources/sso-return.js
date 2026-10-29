// Jellyfin web: send Quick Connect QR scans through authentik, and keep deep
// links across the "Sign in with authentik" button.
//
// Installed into JavaScript Injector by stacks/system/jellyfin-sso.ts, as the
// script "SSO return (managed by Pulumi)" with "Requires Authentication" off, so
// it is served from public.js and also runs for signed-out visitors -- the only
// visitors it acts on. Edit it here; changes made in Jellyfin's UI are put back
// on the stack's next run. See docs/kubernetes/jellyfin-sso.md.
//
// jellyfin-web 12.4 sends a signed-out visitor from any page to
//   #/login?serverid=...&url=<encoded original path and query>
// (ConnectionRequired.tsx). This reads that `url` and:
//   1. Quick Connect -- /quickconnect?code=X, which is the QR Moonfin shows:
//      goes straight to /sso/OID/start/authentik?qc=X. The plugin signs in
//      through authentik and lands on the Quick Connect page with the code
//      filled in. It never presses Authorize: Jellyfin cannot show which device
//      a code belongs to, so that tap is the only consent step there is.
//   2. Anything else: puts it on the button's form as `returnUrl`, so SSO lands
//      where the visitor was going instead of on the home page.
// A signed-in visitor never reaches #/login, so nothing here runs for them.
(() => {
    // The plugin's provider name, case-sensitive. Must match SSO_PROVIDER_NAME in
    // stacks/system/jellyfin-sso.ts, login-disclaimer.html and the redirect URIs in
    // ../definition.yaml.
    const START_PATH = "/sso/OID/start/authentik";

    // One automatic redirect per code per tab. Pressing Back on authentik's page --
    // say, for a password-only account with no authentik login -- then leaves the
    // normal login page, with the code still in `url`, so signing in with a
    // password continues to Quick Connect the way it always has.
    const GUARD_KEY = "jellyfin-sso-qc-redirect";
    const GUARD_MS = 5 * 60 * 1000;

    // jellyfin-web's hash router navigates with history.pushState, which fires no
    // event, so there is nothing to listen for. Polling is cheap: off #/login it
    // is one string comparison.
    const POLL_MS = 400;

    // Splits "/path?query" into its lower-cased path and its parameters.
    const splitRoute = route => {
        const query = route.indexOf("?");
        if (query < 0) return { path: route.toLowerCase(), params: new URLSearchParams() };
        return { path: route.slice(0, query).toLowerCase(), params: new URLSearchParams(route.slice(query + 1)) };
    };

    // The decoded `url` of a #/login bounce, or null on any other page.
    const loginReturnPath = () => {
        const { path, params } = splitRoute(location.hash.replace(/^#!?/, ""));
        if (path !== "/login") return null;
        const target = params.get("url");
        // The plugin's own SanitizeReturnUrl rule: server-relative, never "//" or "\".
        if (!target?.startsWith("/") || target.startsWith("//") || target.includes("\\")) return null;
        return target;
    };

    const quickConnectCode = route => {
        const { path, params } = splitRoute(route);
        if (path !== "/quickconnect") return null;
        const code = (params.get("code") ?? "").replace(/\s/g, "");
        return /^\d{6,12}$/.test(code) ? code : null;
    };

    // Records the attempt and reports whether this code may be redirected. False
    // when it already was, or when sessionStorage is unavailable: without the
    // guard a failed sign-in could bounce back here forever.
    const claimRedirect = code => {
        try {
            const last = JSON.parse(sessionStorage.getItem(GUARD_KEY) ?? "null");
            if (last?.code === code && Date.now() - last.at < GUARD_MS) return false;
            sessionStorage.setItem(GUARD_KEY, JSON.stringify({ code, at: Date.now() }));
            return true;
        } catch {
            return false;
        }
    };

    const check = () => {
        const target = loginReturnPath();
        if (!target) return;

        const code = quickConnectCode(target);
        if (code && claimRedirect(code)) {
            // "../" from /web/index.html is the server root.
            location.replace(new URL(`..${START_PATH}?qc=${encodeURIComponent(code)}`, location.href).href);
            return;
        }

        for (const form of document.querySelectorAll(`form[action$="${START_PATH}"]`)) {
            let input = form.querySelector('input[name="returnUrl"]');
            if (!input) {
                input = document.createElement("input");
                input.type = "hidden";
                input.name = "returnUrl";
                form.appendChild(input);
            }
            input.value = target;
        }
    };

    check();
    setInterval(check, POLL_MS);
})();
