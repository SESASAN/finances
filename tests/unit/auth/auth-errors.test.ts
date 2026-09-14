import { describe, expect, it } from "vitest";
import { mapAuthError } from "@/lib/auth/auth-errors";

const SENTINEL = "__sentinel_message_must_never_leak__";

describe("mapAuthError", () => {
  it("returns a generic message for a null error", () => {
    expect(mapAuthError(null, "login")).toEqual({
      formError: "No pudimos completar la operación. Intentá de nuevo.",
    });
  });

  it("returns a generic message for an undefined error", () => {
    expect(mapAuthError(undefined, "signup")).toEqual({
      formError: "No pudimos completar la operación. Intentá de nuevo.",
    });
  });

  it("returns a generic message for an unrecognized code and never throws", () => {
    expect(() =>
      mapAuthError({ code: "totally_made_up_code", message: SENTINEL }, "signup")
    ).not.toThrow();
    expect(
      mapAuthError({ code: "totally_made_up_code", message: SENTINEL }, "signup")
    ).toEqual({ formError: "No pudimos completar la operación. Intentá de nuevo." });
  });

  it("collapses invalid_credentials into the generic login message (ADR-4)", () => {
    expect(
      mapAuthError({ code: "invalid_credentials", message: SENTINEL }, "login")
    ).toEqual({
      formError:
        "Email o contraseña incorrectos, o tu cuenta todavía no está confirmada.",
    });
  });

  it("collapses email_not_confirmed into the SAME generic login message (ADR-4)", () => {
    const invalidCredentials = mapAuthError(
      { code: "invalid_credentials", message: SENTINEL },
      "login"
    );
    const emailNotConfirmed = mapAuthError(
      { code: "email_not_confirmed", message: SENTINEL },
      "login"
    );

    expect(emailNotConfirmed).toEqual(invalidCredentials);
  });

  it("maps weak_password to a field error on signup", () => {
    expect(mapAuthError({ code: "weak_password" }, "signup")).toEqual({
      formError: "No pudimos completar la operación. Intentá de nuevo.",
      fieldErrors: { password: ["La contraseña es demasiado débil."] },
    });
  });

  it("maps weak_password to a field error on password-reset-confirm", () => {
    expect(
      mapAuthError({ code: "weak_password" }, "password-reset-confirm")
    ).toEqual({
      formError: "No pudimos completar la operación. Intentá de nuevo.",
      fieldErrors: { password: ["La contraseña es demasiado débil."] },
    });
  });

  it("maps same_password to a field error on password-reset-confirm", () => {
    expect(
      mapAuthError({ code: "same_password" }, "password-reset-confirm")
    ).toEqual({
      formError: "No pudimos completar la operación. Intentá de nuevo.",
      fieldErrors: { password: ["Elegí una contraseña distinta a la anterior."] },
    });
  });

  it.each(["over_email_send_rate_limit", "over_request_rate_limit"])(
    "maps rate-limit code %s to the rate-limit message regardless of context",
    (code) => {
      expect(mapAuthError({ code }, "magic-link")).toEqual({
        formError: "Demasiados intentos. Probá de nuevo en unos minutos.",
      });
    }
  );

  it("maps HTTP 429 status to the rate-limit message even without a known code", () => {
    expect(mapAuthError({ status: 429 }, "password-reset-request")).toEqual({
      formError: "Demasiados intentos. Probá de nuevo en unos minutos.",
    });
  });

  it.each([
    "otp_expired",
    "token_expired",
    "invalid_token",
    "flow_state_expired",
    "flow_state_not_found",
  ])(
    "maps expired-link code %s to the expired-link message in confirm/callback contexts",
    (code) => {
      expect(mapAuthError({ code }, "confirm")).toEqual({
        formError: "El enlace expiró o ya fue usado. Pedí uno nuevo.",
      });
      expect(mapAuthError({ code }, "callback")).toEqual({
        formError: "El enlace expiró o ya fue usado. Pedí uno nuevo.",
      });
    }
  );

  it("never leaks error.message into any mapped output", () => {
    const cases: Array<[Parameters<typeof mapAuthError>[0], Parameters<typeof mapAuthError>[1]]> = [
      [{ code: "invalid_credentials", message: SENTINEL }, "login"],
      [{ code: "email_not_confirmed", message: SENTINEL }, "login"],
      [{ code: "weak_password", message: SENTINEL }, "signup"],
      [{ code: "same_password", message: SENTINEL }, "password-reset-confirm"],
      [{ code: "over_request_rate_limit", message: SENTINEL }, "oauth"],
      [{ code: "otp_expired", message: SENTINEL }, "confirm"],
      [{ code: "unknown_code", message: SENTINEL }, "oauth"],
      [{ status: 500, message: SENTINEL }, "callback"],
    ];

    for (const [error, context] of cases) {
      const result = mapAuthError(error, context);
      expect(JSON.stringify(result)).not.toContain(SENTINEL);
    }
  });
});
