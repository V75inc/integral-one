// Shared presentation for every Clerk step, including email verification/errors.
export const accountAppearance = {
  variables: {
    colorPrimary: "#ededed",
    colorBackground: "#171717",
    colorText: "#f2f1ee",
    colorTextSecondary: "#aaa9a5",
    colorInputBackground: "#222222",
    colorInputText: "#f2f1ee",
    colorDanger: "#ffb49d",
    borderRadius: "8px",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: "14px",
  },
  elements: {
    header: { gap: "8px" },
    headerTitle: {
      fontSize: "24px",
      fontWeight: "600",
      letterSpacing: "-.5px",
      color: "#f2f1ee",
    },
    headerSubtitle: { fontSize: "14px", lineHeight: "1.5", color: "#aaa9a5" },
    rootBox: { width: "100%" },
    cardBox: {
      width: "100%",
      boxShadow: "none",
      border: "none",
      borderRadius: "0",
      background: "transparent",
    },
    card: {
      padding: "0",
      boxShadow: "none",
      border: "none",
      background: "transparent",
      gap: "20px",
    },
    footerAction: { display: "none" },
    footer: { background: "transparent", padding: "12px 0", border: "none" },
    socialButtonsBlockButton: {
      minHeight: "44px",
      background: "#222222",
      border: "1px solid #3d3d3b",
      boxShadow: "none",
      color: "#f2f1ee",
    },
    formFieldInput: {
      minHeight: "44px",
      border: "1px solid #454543",
      boxShadow: "none",
    },
    formButtonPrimary: {
      backgroundColor: "#ededed",
      backgroundImage: "none",
      color: "#1a1a1a",
      minHeight: "44px",
      boxShadow: "none",
      fontWeight: "600",
    },
    dividerLine: { background: "#343432" },
    otpCodeFieldInput: { width: "44px", height: "44px" },
    otpCodeFieldInputs: { gap: "6px" },
    formFieldLabel: { color: "#d5d4cf" },
  },
};

export const accountLocalization = {
  signUp: {
    start: {
      title: "Create your account",
      subtitle: "Get started with Integral One.",
    },
  },
  signIn: {
    start: { title: "Welcome back", subtitle: "Sign in to Integral One." },
  },
};
