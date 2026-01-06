const admin = require("firebase-admin");

exports.verifyRole = async (req, requiredRole) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("No authorization token");
    }

    const token = authHeader.replace("Bearer ", "").trim();

    // ✅ VERIFY FIREBASE ID TOKEN
    const decoded = await admin.auth().verifyIdToken(token);

    // ✅ ROLE CHECK (from custom claims)
    if (!decoded.role || decoded.role !== requiredRole) {
      throw new Error("Forbidden: Invalid role");
    }

    return decoded.uid;
  } catch (err) {
    console.error("❌ Auth Error:", err.message);
    throw new Error("Unauthorized");
  }
};
