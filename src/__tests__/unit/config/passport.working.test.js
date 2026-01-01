// Mock modules before any imports
jest.mock("passport-google-oauth20", () => {
  const mockStrategy = jest.fn();
  return {
    Strategy: mockStrategy
  };
});

// Clear JEST_WORKER_ID to allow testing
delete process.env.JEST_WORKER_ID;

// Set up environment before requiring passport
process.env.NODE_ENV = "development";
process.env.GOOGLE_CLIENT_ID = "test_client_id";
process.env.GOOGLE_CLIENT_SECRET = "test_client_secret";
process.env.BACKEND_URL = "http://localhost:8000";

// Now require passport after mocks are set up
const { Strategy } = require("passport-google-oauth20");

describe("Google OAuth Configuration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Strategy.mockClear();
    
    // Clear JEST_WORKER_ID for each test
    delete process.env.JEST_WORKER_ID;
    
    // Reset environment to defaults
    process.env.NODE_ENV = "development";
    process.env.GOOGLE_CLIENT_ID = "test_client_id";
    process.env.GOOGLE_CLIENT_SECRET = "test_client_secret";
    process.env.BACKEND_URL = "http://localhost:8000";
    
    // Clear module cache to force re-initialization
    delete require.cache[require.resolve("../../../config/passport")];
  });

  describe("Environment Detection", () => {
    test("should not initialize Google Strategy in test environment", () => {
      // Set test environment
      process.env.NODE_ENV = "test";
      
      // Require passport with test environment
      require("../../../config/passport");
      
      // Should not initialize Google Strategy in test environment
      expect(Strategy).not.toHaveBeenCalled();
    });

    test("should not initialize Google Strategy in JEST worker environment", () => {
      // Set JEST worker environment
      process.env.NODE_ENV = "development";
      process.env.JEST_WORKER_ID = "1";
      
      // Require passport with JEST worker environment
      require("../../../config/passport");
      
      // Should not initialize Google Strategy in test environment
      expect(Strategy).not.toHaveBeenCalled();
    });

    test("should initialize Google Strategy in development", () => {
      // Ensure development environment
      process.env.NODE_ENV = "development";
      delete process.env.JEST_WORKER_ID;
      
      // Require passport with development environment
      require("../../../config/passport");
      
      // Should initialize Google Strategy in development
      expect(Strategy).toHaveBeenCalled();
    });

    test("should initialize Google Strategy in production", () => {
      // Set production environment
      process.env.NODE_ENV = "production";
      delete process.env.JEST_WORKER_ID;
      
      // Require passport with production environment
      require("../../../config/passport");
      
      // Should initialize Google Strategy in production
      expect(Strategy).toHaveBeenCalled();
    });
  });

  describe("Environment Variable Requirements", () => {
    test("should not initialize without GOOGLE_CLIENT_ID", () => {
      process.env.NODE_ENV = "development";
      delete process.env.GOOGLE_CLIENT_ID;
      
      // Require passport without GOOGLE_CLIENT_ID
      require("../../../config/passport");
      
      expect(Strategy).not.toHaveBeenCalled();
    });

    test("should not initialize without GOOGLE_CLIENT_SECRET", () => {
      process.env.NODE_ENV = "development";
      delete process.env.GOOGLE_CLIENT_SECRET;
      
      // Require passport without GOOGLE_CLIENT_SECRET
      require("../../../config/passport");
      
      expect(Strategy).not.toHaveBeenCalled();
    });

    test("should initialize with both credentials present", () => {
      process.env.NODE_ENV = "development";
      process.env.GOOGLE_CLIENT_ID = "test_client_id";
      process.env.GOOGLE_CLIENT_SECRET = "test_client_secret";
      
      // Require passport with all credentials
      require("../../../config/passport");
      
      expect(Strategy).toHaveBeenCalled();
    });
  });

  describe("Callback URL Configuration", () => {
    test("should use localhost callback URL in development", () => {
      process.env.NODE_ENV = "development";
      process.env.BACKEND_URL = "http://localhost:8000";
      
      // Require passport with development settings
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
      
      // Require passport with production settings
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
      
      // Require passport without BACKEND_URL
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
      
      // Require passport with custom BACKEND_URL
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
      
      // Require passport with all settings
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
      
      // Require passport with basic settings
      require("../../../config/passport");
      
      expect(Strategy).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Function)
      );
    });
  });
});
