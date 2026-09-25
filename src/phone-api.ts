import { NextResponse } from "next/server";
import { giftErrorResponse, NO_STORE } from "./gift-api";
import { PhoneOrderError } from "./phone-order";

/** A phone refusal as the screen reads it, a code and a sentence; anything else is the house's usual answer. */
export function phoneErrorResponse(error: unknown): NextResponse {
  if (error instanceof PhoneOrderError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.status, headers: NO_STORE });
  return giftErrorResponse(error);
}
