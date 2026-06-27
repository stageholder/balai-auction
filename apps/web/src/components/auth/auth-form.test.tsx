import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AuthForm } from "./auth-form";

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("AuthForm", () => {
  it("renders email and password fields", () => {
    render(<AuthForm mode="sign-in" />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("shows a sign-in submit label in sign-in mode", () => {
    render(<AuthForm mode="sign-in" />);
    expect(
      screen.getByRole("button", { name: /sign in/i })
    ).toBeInTheDocument();
  });

  it("shows a sign-up submit label in sign-up mode", () => {
    render(<AuthForm mode="sign-up" />);
    expect(
      screen.getByRole("button", { name: /create account/i })
    ).toBeInTheDocument();
  });
});
