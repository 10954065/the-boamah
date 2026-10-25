import "dotenv/config";

// Point every module at the disposable test database before anything imports the Prisma client.
const url = process.env.TEST_DATABASE_URL;
if (!url || !/test/i.test(new URL(url).pathname)) {
  throw new Error("Refusing to run integration tests: TEST_DATABASE_URL must name a test database.");
}
process.env.DATABASE_URL = url;
process.env.PAYSTACK_SECRET_KEY = "sk_test_integration_secret";
process.env.RESEND_API_KEY = "";
process.env.EMAIL_FROM = "";
process.env.SMS_PROVIDER = "none";
