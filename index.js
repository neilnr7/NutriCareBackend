require("dotenv").config();
const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");

// Initialize Firebase once
if (!admin.apps.length) {
    admin.initializeApp();
}

// Import handlers
const patient = require("./patient");
const doctor = require("./doctor");
// ===============================



// ---------------- PATIENT FUNCTIONS ----------------
exports.sendEmailOTP = onRequest(patient.sendEmailOTP);
exports.verifyEmailOTP = onRequest(patient.verifyEmailOTP);
exports.registerPatient = onRequest(patient.registerPatient);
exports.loginPatient = onRequest(patient.loginPatient);
exports.updatePatientProfile = onRequest(patient.updatePatientProfile);
exports.getPatientProfile = onRequest(patient.getPatientProfile);


// ---------------- DOCTOR FUNCTIONS ----------------
exports.sendDoctorEmailOTP = onRequest(doctor.sendDoctorEmailOTP);
exports.verifyDoctorEmailOTP = onRequest(doctor.verifyDoctorEmailOTP);
exports.registerDoctor = onRequest(doctor.registerDoctor);
exports.loginDoctor = onRequest(doctor.loginDoctor);
exports.updateDoctorProfile = onRequest(doctor.updateDoctorProfile);
exports.getDoctorProfile = onRequest(doctor.getDoctorProfile);

