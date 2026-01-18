// ===============================
// MAIN INDEX FILE
// ===============================

require("dotenv").config();

process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";


const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");

// ---------------- FIREBASE INIT ----------------
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "demo-no-project",
  });
}

// ---------------- IMPORT MODULES ----------------
const patient = require("./patient");
const doctor = require("./doctor");
const appointments = require("./appointments");
const chat = require("./chat");
const diet = require("./diet");



// ===============================
// PATIENT FUNCTIONS
// ===============================
exports.sendEmailOTP = onRequest(patient.sendEmailOTP);
exports.verifyEmailOTP = onRequest(patient.verifyEmailOTP);
exports.registerPatient = onRequest(patient.registerPatient);
exports.loginPatient = onRequest(patient.loginPatient);
exports.updatePatientProfile = onRequest(patient.updatePatientProfile);
exports.getPatientProfile = onRequest(patient.getPatientProfile);


// ===============================
// DOCTOR FUNCTIONS
// ===============================
exports.sendDoctorEmailOTP = onRequest(doctor.sendDoctorEmailOTP);
exports.verifyDoctorEmailOTP = onRequest(doctor.verifyDoctorEmailOTP);
exports.registerDoctor = onRequest(doctor.registerDoctor);
exports.loginDoctor = onRequest(doctor.loginDoctor);
exports.updateDoctorProfile = onRequest(doctor.updateDoctorProfile);
exports.getDoctorProfile = onRequest(doctor.getDoctorProfile);
exports.getDoctors = onRequest(doctor.getDoctors);

// ===============================
// APPOINTMENT FUNCTIONS
// ===============================
exports.createAppointment = onRequest(appointments.createAppointment);
exports.getDoctorAppointmentsByDate = onRequest(
  appointments.getDoctorAppointmentsByDate
);
exports.updateAppointmentStatus = onRequest(
  appointments.updateAppointmentStatus
);
exports.addAppointmentReport = onRequest(
  appointments.addAppointmentReport
);
exports.rescheduleAppointment = onRequest(
  appointments.rescheduleAppointment
);
exports.generateWeeklyAppointment = onRequest(
  appointments.generateWeeklyAppointment
);
exports.getPatientAppointments = onRequest(
  appointments.getPatientAppointments
);
exports.getDoctorAppointmentsByStatus = onRequest(
  appointments.getDoctorAppointmentsByStatus
);

// ---------------- CHAT FUNCTIONS ----------------
exports.createOrGetChat = onRequest(chat.createOrGetChat);
exports.sendMessage = onRequest(chat.sendMessage);
exports.getMessages = onRequest(chat.getMessages);
exports.getDoctorChats = onRequest(chat.getDoctorChats);
exports.getPatientChats = onRequest(chat.getPatientChats);
exports.markChatAsRead = onRequest(chat.markChatAsRead);


// ===============================
// DIET FUNCTIONS
// ===============================
exports.getDoctorDietPatients = onRequest(diet.getDoctorDietPatients);
exports.saveDietPlan = onRequest(diet.saveDietPlan);
exports.getDietForDoctor = onRequest(diet.getDietForDoctor);
exports.getDietForPatient = onRequest(diet.getDietForPatient);
exports.getDoctorPatientsFromAppointments = onRequest(diet.getDoctorPatientsFromAppointments);
