// ============================================================================
// lib/clinicInfo.js — how to reach the clinic, in one place.
//
// Shown in the footer of both sign-in pages (the group's Sept 29 review). One
// file so a changed number or page is one edit, not a hunt through templates.
// A value left null is simply not shown: the phone number is still being
// asked for, and a blank or "TBA" line on the sign-in page reads as unfinished.
// ============================================================================
module.exports = {
  name: "Barangay Sampaguita Health Station",
  place: "Barangay Sampaguita, San Pedro, Laguna",
  facebook: "https://www.facebook.com/profile.php?id=100064702659581",
  email: "sampaguitaclinic@gmail.com",
  phone: null, // e.g. "0917 123 4567" — fill in when the barangay gives it
};
