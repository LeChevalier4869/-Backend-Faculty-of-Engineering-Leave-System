// Mock modules before any imports
jest.mock("passport-google-oauth20", () => {
  const mockStrategy = jest.fn();
  return {
    Strategy: mockStrategy
  };
});

// Set up environment before requiring passport
process.env.NODE_ENV = "development";
process.env.GOOGLE_CLIENT_ID = "test_client_id";
process.env.GOOGLE_CLIENT_SECRET = "test_client_secret";
process.env.BACKEND_URL = "http://localhost:8000";

// Now require passport after mocks are set up
const passport = require("../../../config/passport");
const { Strategy } = require("passport-google-oauth20");

describe("Google OAuth Configuration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Strategy.mockClear();
  });

  afterEach(() => {
    // Reset environment to defaults
    process.env.NODE_ENV = "development";
    process.env.GOOGLE_CLIENT_ID = "test_client_id";
    process.env.GOOGLE_CLIENT_SECRET = "test_client_secret";
    process.env.BACKEND_URL = "http://localhost:8000";
  });

  describe("Environment Detection", () => {
    test("should not initialize Google Strategy in test environment", () => {
      // Set test environment
      process.env.NODE_ENV = "test";
      
      // Clear cache and re-require
      delete require.cache[require.resolve("../../../config/passport")];
      const testPassport = require("../../../config/passport");
      
      // Should not initialize Google Strategy in test environment
      expect(Strategy).not.toHaveBeenCalled();
    });

    test("should not initialize Google Strategy in JEST worker environment", () => {
      // Set JEST worker environment
      process.env.NODE_ENV = "development";
      process.env.JEST_WORKER_ID = "1";
      
      // Clear cache and re-require
      delete require.cache[require.resolve("../../../config/passport")];
      const testPassport = require("../../../config/passport");
      
      // Should not initialize Google Strategy in test environment
      expect(Strategy).not.toHaveBeenCalled();
    });

    test("should initialize Google Strategy in development", () => {
      // Ensure development environment
      process.env.NODE_ENV = "development";
      delete process.env.JEST_WORKER_ID;
      
      // Clear cache and re-require
      delete require.cache[require.resolve("../../../config/passport")];
      const devPassport = require("../../../config/passport");
      
      // Should initialize Google Strategy in development
      expect(Strategy).toHaveBeenCalled();
    });

    test("should initialize Google Strategy in production", () => {
      // Set production environment
      process.env.NODE_ENV = "production";
      delete process.env.JEST_WORKER_ID;
      
      // Clear cache and re-require
      delete require.cache[require.resolve("../../../config/passport")];
      const prodPassport = require("../../../config/passport");
      
      // Should initialize Google Strategy in production
      expect(Strategy).toHaveBeenCalled();
    });
  });

  describe("Environment Variable Requirements", () => {
    test("should not initialize without GOOGLE_CLIENT_ID", () => {
      process.env.NODE_ENV = "development";
      delete process.env.GOOGLE_CLIENT_ID;
      
      // Clear cache and re-require
      delete require.cache[require.resolve("../../../config/passport")];
      require("../../../config/passport");
      
      expect(Strategy).not.toHaveBeenCalled();
    });

    test("should not initialize without GOOGLE_CLIENT_SECRET", () => {
      process.env.NODE_ENV = "development";
      delete process.env.GOOGLE_CLIENT_SECRET;
      
      // Clear cache and re-require
      delete require.cache[require.resolve("../../../config/passport")];
      require("../../../config/passport");
      
      expect(Strategy).not.toHaveBeenCalled();
    });

    test("should initialize with both credentials present", () => {
      process.env.NODE_ENV = "development";
      process.env.GOOGLE_CLIENT_ID = "test_client_id";
      process.env.GOOGLE_CLIENT_SECRET = "test_client_secret";
      
      // Clear cache and re-require
      delete require.cache[require.resolve("../../../config/passport")];
      require("../../../config/passport");
      
      expect(Strategy).toHaveBeenCalled();
    });
  });

  describe("Callback URL Configuration", () => {
    test("should use localhost callback URL in development", () => {
      process.env.NODE_ENV = "development";
      process.env.BACKEND_URL = "http://localhost:8000";
      
      // Clear cache and re-require
      delete require.cache[require.resolve("../../../config/passport")];
      require("../../../config/passport");
      
      expect(Strategy).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL: "http://localhost:8000/auth/google/callback"
        }),
        expect.any(Function)
      );
    });

    test("should use production callback URL in production", () => {
      process.env.NODE_ENV = "production";
      process.env.BACKEND_URL = "https://example.com";
      
      // Clear cache and re-require
      delete require.cache[require.resolve("../../../config/passport")];
      require("../../../config/passport");
      
      expect(Strategy).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL: "https://example.com/auth/google/callback"
        }),
        expect.any(Function)
      );
    });

    test("should use default localhost URL when BACKEND_URL not set in development", () => {
      process.env.NODE_ENV = "development";
      delete process.env.BACKEND_URL;
      
      // Clear cache and re-require
      delete require.cache[require.resolve("../../../config/passport")];
      require("../../../config/passport");
      
      expect(Strategy).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL: "http://localhost:8000/auth/google/callback"
        }),
        expect.any(Function)
      );
    });

    test("should use BACKEND_URL when set in production", () => {
      process.env.NODE_ENV = "production";
      process.env.BACKEND_URL = "https://backend.example.com";
      
      // Clear cache and re-require
      delete require.cache[require.resolve("../../../config/passport")];
      require("../../../config/passport");
      
      expect(Strategy).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL: "https://backend.example.com/auth/google/callback"
        }),
        expect.any(Function)
      );
    });
  });

  describe("Google Strategy Configuration", () => {
    test("should configure Google Strategy with correct credentials", () => {
      process.env.NODE_ENV = "development";
      process.env.GOOGLE_CLIENT_ID = "test_client_id";
      process.env.GOOGLE_CLIENT_SECRET = "test_client_secret";
      process.env.BACKEND_URL = "http://localhost:8000";
      
      // Clear cache and re-require
      delete require.cache[require.resolve("../../../config/passport")];
      require("../../../config/passport");
      
      expect(Strategy).toHaveBeenCalledWith(
        expect.objectContaining({
          clientID: "test_client_id",
          clientSecret: "test_client_secret",
          passReqToCallback: true
        }),
        expect.any(Function)
      );
    });

    test("should configure with required parameters", () => {
      process.env.NODE_ENV = "development";
      
      // Clear cache and re-require
      delete require.cache[require.resolve("../../../config/passport")];
      require("../../../config/passport");
      
      expect(Strategy).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Function)
      );
    });
  });
});
