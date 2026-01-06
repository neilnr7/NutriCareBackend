const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();


// ================= DEV AUTH (POSTMAN / LOCAL) =================
function verifyDevAuth(req) {
  const uid = req.headers["x-user-id"];
  const role = req.headers["x-user-role"];

  if (!uid || !role) {
    throw new Error("Unauthorized: Missing dev auth headers");
  }

  return { uid, role };
}

// ================= TOKEN AUTH =================
async function verifyToken(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Unauthorized: Missing Authorization header");
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const decoded = await admin.auth().verifyIdToken(token);

  return { uid: decoded.uid };
}

// ================= RESOLVE ROLE FROM FIRESTORE =================
async function resolveUserRole(uid) {
  const doctorSnap = await db.collection("doctors").doc(uid).get();
  if (doctorSnap.exists) return "doctor";

  const patientSnap = await db.collection("patients").doc(uid).get();
  if (patientSnap.exists) return "patient";

  throw new Error("Unauthorized: User role not found");
}

// ================= SINGLE ROLE CHECK =================
exports.verifyRole = async (req, requiredRole) => {
  let auth;

  if (req.headers["x-user-id"]) {
    auth = verifyDevAuth(req);
  } else {
    const { uid } = await verifyToken(req);
    const role = await resolveUserRole(uid);
    auth = { uid, role };
  }

  if (auth.role !== requiredRole) {
    throw new Error("Forbidden: Insufficient permissions");
  }

  return auth.uid;
};

// ================= MULTI ROLE CHECK =================
exports.verifyAnyRole = async (req, allowedRoles) => {
  let auth;

  if (req.headers["x-user-id"]) {
    auth = verifyDevAuth(req);
  } else {
    const { uid } = await verifyToken(req);
    const role = await resolveUserRole(uid);
    auth = { uid, role };
  }

  if (!allowedRoles.includes(auth.role)) {
    throw new Error("Forbidden: Insufficient permissions");
  }

  return auth; // { uid, role }
};