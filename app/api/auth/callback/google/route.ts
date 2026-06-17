import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { publicErrorDetail } from "@/lib/granola-db";

function callbackUrl(req: NextRequest) {
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  return `${proto}://${host}/api/auth/callback/google`;
}

function settingsError(req: NextRequest, error: string, detail?: unknown) {
  const url = new URL("/settings", req.url);
  url.searchParams.set("error", error);
  if (detail) url.searchParams.set("detail", publicErrorDetail(detail).slice(0, 220));
  return NextResponse.redirect(url);
}

// Initiates Google OAuth for connecting a calendar or Gmail workspace.
// Each workspace gets its own OAuth flow (separate Google accounts).
// Usage: GET /api/auth/callback/google?action=connect&type=gmail&name=GTM&client_key=coderpad
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url));

  const action = req.nextUrl.searchParams.get("action");

  // Step 1: Initiate OAuth
  if (action === "connect") {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return settingsError(req, "google_env_missing");
    }

    const name = req.nextUrl.searchParams.get("name") || "Workspace";
    const clientKey = req.nextUrl.searchParams.get("client_key") || "";
    const type = req.nextUrl.searchParams.get("type") === "gmail" ? "gmail" : "google_calendar";
    const redirectUri = callbackUrl(req);
    const scopes = type === "gmail"
      ? [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
      ]
      : [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
      ];

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      access_type: "offline",
      prompt: "consent", // Force consent to get refresh_token
      state: JSON.stringify({ name, clientKey, type, userId, redirectUri }),
    });

    return NextResponse.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    );
  }

  // Step 2: OAuth callback - exchange code for tokens
  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state");

  if (!code || !stateRaw) {
    return settingsError(req, "missing_code");
  }

  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return settingsError(req, "google_env_missing");
    }

    const state = JSON.parse(stateRaw);
    const workspaceType = state.type === "gmail" ? "gmail" : "google_calendar";
    const redirectUri = typeof state.redirectUri === "string" ? state.redirectUri : callbackUrl(req);

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();

    if (!tokens.access_token) {
      console.error("Google token exchange failed:", tokens);
      return settingsError(req, "google_token_failed", tokens);
    }

    // Get the email of the connected account for identification
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();

    // Store in Supabase
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error: workspaceError } = await supabase.from("workspaces").upsert(
      {
        type: workspaceType,
        name: state.name,
        client_key: state.clientKey || null,
        workspace_id: profile.email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        is_connected: true,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "type,workspace_id" }
    );

    if (workspaceError) {
      console.error("Google workspace save failed:", workspaceError);
      return settingsError(req, "workspace_save_failed", workspaceError);
    }

    return NextResponse.redirect(
      new URL(`/settings?connected=${workspaceType}&name=${encodeURIComponent(state.name)}`, req.url)
    );
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return settingsError(req, "google_callback_failed", err);
  }
}
