import app from "../src/server.js";

// Express reads the webhook stream itself. Skip the Node helper that parses JSON first,
// so Stripe can verify the raw body. An Express app also skips helpers because it has listen().
export const config = {
  api: {
    bodyParser: false
  }
};

export default app;
