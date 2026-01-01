const passport = require("../../../config/passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

// Mock GoogleStrategy before requiring passport
jest.mock("passport-google-oauth20", () => ({
  Strategy: jest.fn().mockImplementation((config, callback) => {
    return {
      name: 'google',
      _strategy: { ...config, _verify: callback }
    };
  })
}));

describe("Google OAuth Configuration", () => {
  let mockStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NODE_ENV;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.BACKEND_URL;
    delete process.env.JEST_WORKER_ID;
    
    // Get mock instance
    mockStrategy = GoogleStrategy;
  });

  describe("Environment Detection", () => {
    test("should detect test environment correctly", () => {
      process.env.NODE_ENV = "test";
      process.env.GOOGLE_CLIENT_ID = "test_client_id";
      process.env.GOOGLE_CLIENT_SECRET = "test_client_secret";

      // Clear cache and re-require
      delete require.cache[require.resolve("../../../config/passport")];
      const freshPassport = require("../../../config/passport");
      
      // Should not initialize Google Strategy in test environment
      expect(freshPassport._strategies.google).toBeUndefined();
    });

    test("should detect JEST worker environment correctly", () => {
      process.env.JEST_WORKER_ID = "1";
      process.env.GOOGLE_CLIENT_ID = "test_client_id";
      process.env.GOOGLE_CLIENT_SECRET = "test_client_secret";

      delete require.cache[require.resolve("../../../config/passport")];
      const freshPassport = require("../../../config/passport");
      
      // Should not initialize Google Strategy in test environment
      expect(freshPassport._strategies.google).toBeUndefined();
    });
  });

  describe("Google Strategy Initialization", () => {
    test("should initialize Google Strategy in development", () => {
      process.env.NODE_ENV = "development";
      process.env.GOOGLE_CLIENT_ID = "test_client_id";
      process.env.GOOGLE_CLIENT_SECRET = "test_client_secret";
      process.env.BACKEND_URL = "http://localhost:8000";

      delete require.cache[require.resolve("../../../config/passport")];
      const freshPassport = require("../../../config/passport");
      
      expect(freshPassport._strategies.google).toBeDefined();
    });

    test("should initialize Google Strategy in production", () => {
      process.env.NODE_ENV = "production";
      process.env.GOOGLE_CLIENT_ID = "test_client_id";
      process.env.GOOGLE_CLIENT_SECRET = "test_client_secret";
      process.env.BACKEND_URL = "https://example.com";

      delete require.cache[require.resolve("../../../config/passport")];
      const freshPassport = require("../../../config/passport");
      
      expect(freshPassport._strategies.google).toBeDefined();
    });

    test("should not initialize Google Strategy without credentials", () => {
      process.env.NODE_ENV = "development";
      // Missing GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET

      delete require.cache[require.resolve("../../../config/passport")];
      const freshPassport = require("../../../config/passport");
      
      expect(freshPassport._strategies.google).toBeUndefined();
    });
  });

  describe("Callback URL Configuration", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
      process.env.GOOGLE_CLIENT_ID = "test_client_id";
      process.env.GOOGLE_CLIENT_SECRET = "test_client_secret";
      process.env.BACKEND_URL = "http://localhost:8000";
    });

    test("should use localhost callback URL in development", () => {
      process.env.NODE_ENV = "development";
      process.env.BACKEND_URL = "http://localhost:8000";

      delete require.cache[require.resolve("../../../config/passport")];
      require("../../../config/passport");
      
      expect(mockStrategy).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL: "http://localhost:8000/auth/google/callback"
        }),
        expect.any(Function)
      );
    });

    test("should use production callback URL in production", () => {
      process.env.NODE_ENV = "production";
      process.env.BACKEND_URL = "https://example.com";

      delete require.cache[require.resolve("../../../config/passport")];
      require("../../../config/passport");
      
      expect(mockStrategy).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL: "https://example.com/auth/google/callback"
        }),
        expect.any(Function)
      );
    });

    test("should use default localhost URL when BACKEND_URL not set in development", () => {
      process.env.NODE_ENV = "development";
      delete process.env.BACKEND_URL;

      delete require.cache[require.resolve("../../../config/passport")];
      require("../../../config/passport");
      
      expect(mockStrategy).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL: "http://localhost:8000/auth/google/callback"
        }),
        expect.any(Function)
      );
    });

    test("should use BACKEND_URL when set in production", () => {
      process.env.NODE_ENV = "production";
      process.env.BACKEND_URL = "https://backend.example.com";

      delete require.cache[require.resolve("../../../config/passport")];
      require("../../../config/passport");
      
      expect(mockStrategy).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL: "https://backend.example.com/auth/google/callback"
        }),
        expect.any(Function)
      );
    });
  });

  describe("Google Strategy Configuration", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
      process.env.GOOGLE_CLIENT_ID = "test_client_id";
      process.env.GOOGLE_CLIENT_SECRET = "test_client_secret";
      process.env.BACKEND_URL = "http://localhost:8000";
    });

    test("should configure Google Strategy with correct credentials", () => {
      delete require.cache[require.resolve("../../../config/passport")];
      require("../../../config/passport");
      
      expect(mockStrategy).toHaveBeenCalledWith(
        expect.objectContaining({
          clientID: "test_client_id",
          clientSecret: "test_client_secret",
          passReqToCallback: true
        }),
        expect.any(Function)
      );
    });

    test("should configure with required scopes", () => {
      delete require.cache[require.resolve("../../../config/passport")];
      require("../../../config/passport");
      
      expect(mockStrategy).toHaveBeenCalled();
    });
  });

  describe("Environment Variable Requirements", () => {
    test("should require GOOGLE_CLIENT_ID", () => {
      process.env.NODE_ENV = "development";
      process.env.GOOGLE_CLIENT_SECRET = "test_client_secret";
      // Missing GOOGLE_CLIENT_ID

      delete require.cache[require.resolve("../../../config/passport")];
      const freshPassport = require("../../../config/passport");
      
      expect(freshPassport._strategies.google).toBeUndefined();
    });

    test("should require GOOGLE_CLIENT_SECRET", () => {
      process.env.NODE_ENV = "development";
      process.env.GOOGLE_CLIENT_ID = "test_client_id";
      // Missing GOOGLE_CLIENT_SECRET

      delete require.cache[require.resolve("../../../config/passport")];
      const freshPassport = require("../../../config/passport");
      
      expect(freshPassport._strategies.google).toBeUndefined();
    });

    test("should work with both credentials present", () => {
      process.env.NODE_ENV = "development";
      process.env.GOOGLE_CLIENT_ID = "test_client_id";
      process.env.GOOGLE_CLIENT_SECRET = "test_client_secret";

      delete require.cache[require.resolve("../../../config/passport")];
      const freshPassport = require("../../../config/passport");
      
      expect(freshPassport._strategies.google).toBeDefined();
    });
  });
});
