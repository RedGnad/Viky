import { type NextRequest, NextResponse } from "next/server";
import webPush from "web-push";

// Web push through VAPID keys, kept from the Foundation template. The subscription is supplied by
// the caller for now; a server-side subscription store comes with the first product screens.
export const POST = async (req: NextRequest) => {
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
  const email = process.env.WEB_PUSH_EMAIL;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  if (!publicKey || !email || !privateKey) {
    return NextResponse.json({ error: "PUSH_NOT_CONFIGURED" }, { status: 503 });
  }

  let body: { subscription?: webPush.PushSubscription; title?: string; message?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (!body.subscription?.endpoint) {
    return NextResponse.json({ error: "MISSING_SUBSCRIPTION" }, { status: 400 });
  }

  try {
    webPush.setVapidDetails(`mailto:${email}`, publicKey, privateKey);
    const response = await webPush.sendNotification(
      body.subscription,
      JSON.stringify({
        title: body.title ?? "Viky",
        message: body.message ?? "Your gift has news.",
      }),
    );
    return new NextResponse(response.body, { status: response.statusCode });
  } catch (error) {
    if (error instanceof webPush.WebPushError) {
      return new NextResponse(error.body, { status: error.statusCode });
    }
    return NextResponse.json({ error: "PUSH_FAILED" }, { status: 500 });
  }
};
