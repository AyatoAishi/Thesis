// ============================================================================
// lib/i18n.js — English / Tagalog, chosen by the person reading.
//
// "Please add a translate button to have a consistent and deliberate tagalog
// or english descriptions." — the professors' review; and from the group:
// the button inside both the staff side and the patient portal, with the
// sign-in pages always in English.
//
// The word that matters there is CONSISTENT. The problem the review found was
// not a missing language, it was pages that switched language mid-sentence —
// an English form with a Tagalog hint under one field and a Taglish banner on
// another. So each string here exists in both languages, and a page reads in
// one of them.
//
// Defaults: staff read English (it is the language of the clinical terms on
// every form); patients read Tagalog. Either can switch, and the choice is
// remembered — for staff on their account, for patients for the session.
//
// Usage in a view: <%= t("nav.patients") %>, or with values,
// <%= t("dash.appts_on", { n: 3 }) %> where the string holds {n}.
// ============================================================================

const LANGS = ["en", "tl"];

// key: [English, Tagalog]
const D = {
  // ---- the toggle ----------------------------------------------------------
  "lang.label": ["Language", "Wika"],
  "lang.en": ["English", "English"],
  "lang.tl": ["Tagalog", "Tagalog"],

  // ---- navigation ------------------------------------------------------------
  "nav.dashboard": ["Dashboard", "Dashboard"],
  "nav.patients": ["Patients", "Pasyente"],
  "nav.appointments": ["Appointments", "Appointment"],
  "nav.forms": ["Forms", "Form"],
  "nav.inventory": ["Inventory", "Imbentaryo"],
  "nav.reports": ["Reports", "Ulat"],
  "nav.portal": ["Portal", "Portal"],
  "nav.reminders": ["Reminders", "Paalala"],
  "nav.staff": ["Staff", "Staff"],
  "nav.announcements": ["Announcements", "Anunsyo"],
  "nav.back": ["Back", "Bumalik"],
  "brand.station": ["Barangay Health Station", "Barangay Health Station"],

  // ---- topbar -----------------------------------------------------------------
  "top.search": ["Search patient by name or number…", "Hanapin ang pasyente sa pangalan o numero…"],
  "top.no_appts": ["No appointments today", "Walang appointment ngayon"],
  "top.appts_today": ["{n} appointment{s} today", "{n} appointment ngayon"],
  "top.notifications": ["Notifications", "Mga abiso"],
  "top.needs_attention": ["Needs attention", "Kailangang asikasuhin"],
  "top.nothing_now": ["Nothing right now.", "Wala sa ngayon."],
  "top.update_profile": ["Update profile", "I-update ang profile"],
  "top.manual": ["User's manual", "Manwal ng gumagamit"],
  "top.logout": ["Logout", "Mag-logout"],

  // ---- dashboard ----------------------------------------------------------------
  "dash.title": ["Dashboard", "Dashboard"],
  "dash.expected": ["Expected today", "Inaasahan ngayon"],
  "dash.expected_sub": ["scheduled + done + missed", "naka-schedule + tapos + hindi dumating"],
  "dash.patients": ["Patients", "Mga pasyente"],
  "dash.patients_sub": ["total records", "kabuuang record"],
  "dash.completed": ["Completed today", "Natapos ngayon"],
  "dash.completed_sub": ["marked done", "minarkahang tapos"],
  "dash.missed": ["Missed today", "Hindi dumating ngayon"],
  "dash.missed_sub": ["no-shows", "hindi sumipot"],
  "dash.attention": ["Needs attention", "Kailangang asikasuhin"],
  "dash.calendar": ["Calendar", "Kalendaryo"],
  "dash.calendar_hint": ["Press a day to see its appointments.", "Pindutin ang araw para makita ang mga appointment nito."],
  "dash.prev_month": ["Previous month", "Nakaraang buwan"],
  "dash.next_month": ["Next month", "Susunod na buwan"],
  "dash.today": ["Today", "Ngayon"],
  "dash.open_list": ["Open the full list", "Buksan ang buong listahan"],
  "dash.book": ["+ Book", "+ Magpa-book"],
  "dash.no_appts_day": ["No appointments on this day.", "Walang appointment sa araw na ito."],
  "dash.tip_none": ["No appointments", "Walang appointment"],
  "dash.cell_done": ["done", "tapos"],
  "dash.cell_missed": ["missed", "di dumating"],
  "dash.cell_booked": ["booked", "naka-book"],
  "dash.legend_done": ["came — completed", "dumating — natapos"],
  "dash.legend_missed": ["missed — didn't come", "hindi dumating"],
  "dash.legend_booked": ["booked — still to come", "naka-book — darating pa lang"],
  "dash.tip_done": ["{n} done", "{n} tapos"],
  "dash.tip_missed": ["{n} missed", "{n} hindi dumating"],
  "dash.tip_booked": ["{n} booked", "{n} naka-book"],
  "dash.tip_cancelled": ["{n} cancelled", "{n} kinansela"],
  "dash.quick": ["Quick actions", "Mabilisang gawain"],
  "dash.q1a": ["Add a patient", "Magdagdag ng pasyente"],
  "dash.q1b": ["book an appointment", "mag-book ng appointment"],
  "dash.q1": ["{a}, then {b}.", "{a}, pagkatapos ay {b}."],
  "dash.q2a": ["daily list", "listahan ngayong araw"],
  "dash.q2": ["Open the {a} to mark patients done or missed as they arrive.", "Buksan ang {a} para markahan ang pasyente kung tapos o hindi dumating."],
  "dash.q3a": ["form", "form"],
  "dash.q3": ["Record what happened in a {a} — immunization, prenatal, or family planning.", "Itala ang nangyari sa isang {a} — bakuna, prenatal, o family planning."],
  "status.scheduled": ["Scheduled", "Naka-schedule"],
  "status.completed": ["Done", "Tapos"],
  "status.missed": ["Missed", "Hindi dumating"],
  "status.cancelled": ["Cancelled", "Kinansela"],

  // ---- patients -------------------------------------------------------------------
  "pat.title": ["Patients", "Mga Pasyente"],
  "pat.add": ["+ Add patient", "+ Magdagdag ng pasyente"],
  "pat.search": ["Name, patient #, mobile #, email, or family # (26-0001)…", "Pangalan, patient #, mobile #, email, o family # (26-0001)…"],
  "pat.sort_by": ["Sort by", "Ayusin ayon sa"],
  "pat.search_btn": ["Search", "Hanapin"],
  "pat.tab_all": ["All patients", "Lahat ng pasyente"],
  "pat.tab_household": ["By household", "Ayon sa pamilya"],
  "pat.tab_families": ["Family records", "Mga family record"],
  "pat.tab_overdue": ["Overdue only", "May lampas na lang"],
  "pat.col_num": ["Patient #", "Patient #"],
  "pat.col_name": ["Name", "Pangalan"],
  "pat.col_sex": ["Sex", "Kasarian"],
  "pat.col_age": ["Age", "Edad"],
  "pat.col_mobile": ["Mobile #", "Mobile #"],
  "pat.col_email": ["Email", "Email"],
  "pat.col_family": ["Family #", "Family #"],
  "pat.edit": ["Edit", "I-edit"],
  "pat.layout": ["Layout", "Ayos"],
  "pat.layout_list": ["List", "Listahan"],
  "pat.layout_cards": ["Cards", "Cards"],
  "pat.open": ["Open", "Buksan"],
  "dash.all_clear": ["Nothing needs chasing right now.", "Walang kailangang habulin ngayon."],
  "dash.all_clear_sub": ["No one is overdue, stock is above its levels, and today's list is clear.", "Walang lampas, sapat ang stock, at malinis ang listahan ngayong araw."],
  "dash.open": ["open", "bukas"],
  "pat.count": ["{n} record{s}", "{n} record"],
  "pat.matching": ["matching “{q}”", "na tugma sa “{q}”"],
  "pat.none_overdue": ["Nobody is overdue.", "Walang lampas."],
  "pat.none_overdue_q": ["Nobody is overdue among the patients matching this search.", "Walang lampas sa mga pasyenteng tugma sa hinanap."],
  "pat.show_all": ["Show all patients", "Ipakita lahat ng pasyente"],
  "pat.none_yet": ["No patients yet. Click <b>Add patient</b> to create the first record.", "Wala pang pasyente. Pindutin ang <b>Magdagdag ng pasyente</b> para gawin ang unang record."],
  "bell.waiting": ["{n} patient{s} still expected today", "{n} pasyente pa ang inaasahan ngayon"],
  "bell.imm_one": ["{n} child overdue for immunization", "{n} batang lampas na sa bakuna"],
  "bell.imm_many": ["{n} children overdue for immunization", "{n} batang lampas na sa bakuna"],
  "bell.low": ["{n} medicine{s} low on stock", "{n} gamot na paubos na ang stock"],
  "bell.expired_one": ["{n} medicine has expired stock to dispose of", "{n} gamot na may expired na stock na dapat itapon"],
  "bell.expired_many": ["{n} medicines have expired stock to dispose of", "{n} gamot na may expired na stock na dapat itapon"],
  "pat.minor": ["Minor", "Menor de edad"],
  "pat.deceased": ["Deceased", "Pumanaw"],
  "pat.no_phone": ["No phone of their own", "Walang sariling telepono"],
  "pat.no_contact": ["No contact number at all", "Walang kahit anong contact number"],
  "pat.no_contact_hint": ["Neither the patient nor anyone else can be reached by phone. They can still be registered and seen; they just get no SMS reminders (walk-in).",
                          "Walang telepono ang pasyente at walang ibang maaaring tawagan. Maire-register pa rin at matitingnan; wala lang SMS na paalala (walk-in)."],
  "pat.no_phone_hint": ["Reminders go to the emergency contact # below. Common for infants and the elderly.",
                        "Sa emergency contact # sa ibaba ipapadala ang paalala. Karaniwan ito sa sanggol at sa matatanda."],

  // ---- appointments -------------------------------------------------------------------
  "appt.notes_other_hint": ["Say what was done — vitals, BP, a dressing change. This note is the only record of this visit.",
                            "Sabihin kung ano ang ginawa — vitals, BP, palit ng benda. Ito lang ang record ng pagpuntang ito."],

  // ---- inventory ---------------------------------------------------------------------
  "inv.choose_unit": ["— choose —", "— pumili —"],
  "inv.legacy_unit": ["{u} — not a valid unit, change it", "{u} — hindi tama, palitan"],
  "inv.dosage_hint": ["The strength goes here only, never in the name: \"Amlodipine\" + \"10mg\", not \"Amlodipine 10mg\" — one fact in two places is how duplicate medicines happen. Include the unit: 10mg, not 10.",
                      "Ang lakas ay dito lang, hindi sa pangalan: \"Amlodipine\" + \"10mg\", hindi \"Amlodipine 10mg\" — kapag nasa dalawang lugar ang isang bagay, nagkakadoble ang gamot. Isama ang unit: 10mg, hindi 10."],
  "inv.archived_title": ["This medicine is archived", "Naka-archive ang gamot na ito"],
  "inv.archived_body": ["It is off the inventory list and out of the dispense dropdown. Every past dispense is intact — no record was deleted.",
                        "Wala siya sa listahan ng inventory at wala sa dropdown ng dispense. Buo pa rin ang lahat ng naunang dispense niya — walang naburang record."],
  "inv.archived_stock": ["It still has {n} in stock. If there really is some left on the shelf, restore it; if not, correct the count to 0 — otherwise stock is counted that nobody can use.",
                         "May {n} pa siyang stock. Kung may natitira talaga sa lalagyan, ibalik siya sa listahan; kung wala, itama ang bilang sa 0 — kung hindi, may binibilang na gamot na walang makakagamit."],
  "inv.restore": ["Restore to the list", "Ibalik sa listahan"],
  "inv.archived_list_title": ["Archived medicines", "Mga naka-archive na gamot"],
  "inv.archived_list_body": ["They are out of the inventory and out of dispensing. Open one and press Restore to the list if it was archived by mistake.",
                             "Wala sila sa inventory at wala sa dispense. Buksan ang isa at pindutin ang Ibalik sa listahan kung mali ang pag-archive."],
  "inv.dispense_medicines_hint": ["Every medicine they take home today. One save: all of them come off the stock together, and if any one is short, none of them do.",
                                  "Lahat ng gamot na iuuwi nila ngayon. Isang beses lang i-save — sabay-sabay na babawas sa stock, at kung kulang ang kahit isa, walang mababawas sa lahat."],
  "inv.add_line": ["+ Another medicine", "+ Isa pang gamot"],
  "inv.remove_line": ["Remove", "Alisin"],

  // ---- portal (patients) ---------------------------------------------------------------
  "por.hello": ["Hello, {name} 👋", "Hello, {name} 👋"],
  "por.about": ["About", "Tungkol"],
  "por.home": ["Home", "Home"],
  "por.logout": ["Log out", "Mag-logout"],
  "por.signin": ["Sign in", "Mag-sign in"],
  "por.temp_pw": ["Your password is still the temporary one.", "Pansamantala pa ang password mo."],
  "por.temp_pw_do": ["Change it to your own under Change password. →", "Palitan ito ng sarili mo sa Palitan ang password. →"],
  "por.unverified": ["Your account is not verified yet.", "Hindi pa verified ang account mo."],
  "por.unverified_do": ["Show a valid ID at the clinic to see your full record.", "Ipakita ang valid ID sa clinic para makita ang buong record mo."],
  "por.next": ["Next appointment", "Susunod na appointment"],
  "por.none_sched": ["You have nothing scheduled.", "Wala kang naka-schedule."],
  "por.remind": ["We will remind you the day before.", "Paaalalahanan ka namin isang araw bago."],
  "por.how_book": ["How do I get an appointment?", "Paano magpa-appointment?"],
  "por.how_book_body": ["Come to the clinic, <b>8 AM – 5 PM</b> (closed 12–1), with your patient number. The staff will put you on the schedule.",
                        "Pumunta sa clinic, <b>8 AM – 5 PM</b> (sarado 12–1), dala ang patient number mo. Ang staff ang maglalagay ng schedule."],
  "por.my_appts": ["My appointments", "Mga appointment ko"],
  "por.none": ["None yet.", "Wala pa."],
  "por.col_date": ["Date", "Petsa"],
  "por.col_service": ["Service", "Serbisyo"],
  "por.col_time": ["Time", "Oras"],
  "por.col_status": ["Status", "Status"],
  "por.col_medicine": ["Medicine", "Gamot"],
  "por.col_qty": ["Quantity", "Dami"],
  "por.change_appt": ["To change or cancel, tell the clinic.", "Para magpalit o magkansela, sabihin sa clinic."],
  "por.meds": ["💊 Medicines I received", "💊 Mga gamot na natanggap ko"],
  "por.children": ["👨‍👩‍👧 My children", "👨‍👩‍👧 Mga anak ko"],
  "por.children_hint": ["Open to see their immunization card.", "Buksan para makita ang immunization card nila."],
  "por.view": ["View →", "Tingnan →"],
  "por.info": ["My information", "Impormasyon ko"],
  "por.name": ["Name", "Pangalan"],
  "por.birthdate": ["Birthdate", "Kaarawan"],
  "por.sex": ["Sex", "Kasarian"],
  "por.male": ["Male", "Lalaki"],
  "por.female": ["Female", "Babae"],
  "por.number": ["Mobile number", "Numero"],
  "por.address": ["Address", "Address"],
  "por.wrong_info": ["Something wrong? Tell the clinic — only they can correct it.", "May mali? Sabihin sa clinic — sila lang ang makakapag-ayos."],
  "por.pw_title": ["🔑 Change password", "🔑 Palitan ang password"],
  "por.pw_forgot": ["If you forget it, go to the clinic right away with a valid ID to get a new password.",
                    "Kung makalimutan, agad na pumunta sa klinika dala ang valid ID upang mabigyan ng bagong password."],
  "por.pw_ok": ["✅ Your password has been changed.", "✅ Napalitan na ang password mo."],
  "por.pw_current": ["Current password", "Kasalukuyang password"],
  "por.pw_new": ["New password", "Bagong password"],
  "por.pw_min": ["(8 characters or more)", "(8 characters pataas)"],
  "por.pw_again": ["Type the new password again", "Ulitin ang bagong password"],
  "por.pw_btn": ["Change", "Palitan"],
  "por.prenatal": ["🤰 My prenatal record", "🤰 Prenatal record ko"],
  "por.edd": ["Expected date of delivery", "Inaasahang petsa ng panganganak"],
  "por.pn_status": ["Status", "Status"],
  "por.pn_active": ["Ongoing", "Tuloy-tuloy"],
  "por.pn_delivered": ["Delivered", "Nanganak na"],
  "por.pn_closed": ["Closed", "Sarado"],
  "por.lmp": ["Last menstrual period", "Huling regla (LMP)"],
  "por.gp": ["Pregnancies (G / P)", "Pagbubuntis (G / P)"],
  "por.tetanus": ["Tetanus", "Tetanus"],
  "por.tt_of": ["{n} of 5 doses", "{n} sa 5 na dose"],
  "por.checkups": ["Check-ups", "Mga check-up"],
  "por.aog": ["Weeks (AOG)", "Linggo (AOG)"],
  "por.bp": ["BP", "BP"],
  "por.weight": ["Weight", "Timbang"],
  "por.fht": ["Baby's heartbeat", "Tibok ng puso ng baby"],
  "por.visits": ["My consultations", "Mga konsultasyon ko"],
  "por.temp": ["Temp", "Temp"],
  "por.diagnosis": ["Diagnosis", "Diagnosis"],
  "por.imm_card": ["💉 Immunization card", "💉 Immunization card"],
  "por.imm_hint": ["The same as the \"Todo Ligtas\" card. A box missing? Ask the clinic.", "Kapareho ng \"Todo Ligtas\" card. Kulang ang isang box? Itanong sa clinic."],
  "por.imm_none": ["No vaccines recorded yet.", "Wala pang naitalang bakuna."],
  "por.sched_title": ["Clinic schedule", "Iskedyul ng clinic"],
  "por.sched_today": ["Today", "Ngayon"],
  "por.sched_hours": ["<b>8:00 AM – 5:00 PM</b> · closed 12:00–1:00 for lunch", "<b>8:00 AM – 5:00 PM</b> · sarado 12:00–1:00 para sa tanghalian"],
  "por.day_sun": ["Sunday", "Linggo"],
  "por.day_mon": ["Monday", "Lunes"],
  "por.day_tue": ["Tuesday", "Martes"],
  "por.day_wed": ["Wednesday", "Miyerkules"],
  "por.day_thu": ["Thursday", "Huwebes"],
  "por.day_fri": ["Friday", "Biyernes"],
  "por.day_sat": ["Saturday", "Sabado"],
  "por.svc_immunization": ["Immunization (vaccines)", "Bakuna (immunization)"],
  "por.svc_prenatal": ["Prenatal check-up", "Prenatal checkup"],
  "por.svc_medicine": ["Medicine distribution", "Pamimigay ng gamot"],
  "por.sections": ["Portal sections", "Mga bahagi ng portal"],
  "por.tab_overview": ["Overview", "Buod"],
  "por.tab_appts": ["Appointments", "Mga appointment"],
  "por.tab_imm": ["Immunization", "Bakuna"],
  "por.tab_records": ["Medicines & records", "Gamot at records"],
  "por.tab_info": ["My information", "Impormasyon ko"],
  "por.tab_pw": ["Change password", "Palitan ang password"],
  "por.announcements": ["Announcements", "Mga anunsyo"],
  "por.ann_until": ["Until {d}", "Hanggang {d}"],
  "por.ann_count": ["{n} announcement{s}", "{n} anunsyo"],
  "por.missed_title": ["Missed appointments", "Mga hindi napuntahang appointment"],
  "por.missed_body": ["You missed {n} appointment{s} in the last 3 months. Visit the clinic to set a new date.", "May {n} appointment kang hindi napuntahan nitong nakaraang 3 buwan. Pumunta sa clinic para magpa-schedule ulit."],
  "por.patient_no": ["Patient number", "Patient number"],
  "por.email": ["Email", "Email"],
  "por.records_none": ["No medicines or records yet.", "Wala pang gamot o record."],
  "por.children_open": ["Open", "Buksan"],
  "por.imm_vaccine": ["Vaccine", "Bakuna"],
  "por.imm_due": ["When it's due", "Kailan dapat"],
  "por.imm_doses": ["Doses", "Mga dose"],
  "por.imm_dose": ["Dose {n}", "Dose {n}"],
  "por.imm_not_yet": ["not yet", "wala pa"],
  "por.imm_other": ["Other vaccines", "Iba pang bakuna"],
  "por.imm_given": ["Date given", "Petsa ng bakuna"],
  "por.back_me": ["Back to my page", "Balik sa akin"],
  "por.dep_why": ["You can see this because you share one <b>household number</b> given by the clinic, and they are still a minor. <b>View only</b> — only the clinic can change records, and only the clinic can book or cancel for them.", "Nakikita mo ito dahil kasama kayo sa iisang <b>household number</b> na binigay ng clinic, at menor de edad pa siya. <b>View only</b> — ang clinic lang ang makakapagbago ng records, at ang clinic lang din ang makakapag-book o makakapag-cancel para sa kanya."],
  "por.dep_appts": ["{name}'s appointments", "Appointments ni {name}"],
  "por.dep_no_appts": ["No appointments yet.", "Wala pang appointment."],
  "por.dep_meds": ["💊 Medicines {name} received", "💊 Mga gamot na natanggap ni {name}"],
  "por.dep_no_meds": ["None yet — medicines given at the clinic will show here.", "Wala pa — lalabas dito ang mga gamot na ibinigay sa clinic."],
  "por.ab_station": ["Barangay Health Station · Barangay Sampaguita, San Pedro, Laguna", "Barangay Health Station · Barangay Sampaguita, San Pedro, Laguna"],
  "por.ab_what": ["What the clinic does", "Ano ang ginagawa ng clinic"],
  "por.ab_what_1": ["<b>Vaccines</b> for children, on the DOH schedule", "<b>Bakuna</b> para sa mga bata, ayon sa schedule ng DOH"],
  "por.ab_what_2": ["<b>Prenatal check-ups</b> for pregnant mothers", "<b>Prenatal checkup</b> para sa mga buntis"],
  "por.ab_what_3": ["<b>Medicines</b>, including family planning", "<b>Pamimigay ng gamot</b>, kasama ang family planning"],
  "por.ab_what_4": ["<b>Consultations</b>, and taking BP, weight and more", "<b>Konsultasyon</b> at pagkuha ng BP, timbang at iba pa"],
  "por.ab_step_1": ["<b>Come to the clinic</b> — walk-in only.", "<b>Pumunta sa clinic</b> — walk-in lang."],
  "por.ab_step_2": ["<b>8:00 AM to 5:00 PM.</b> Closed 12:00–1:00 for lunch.", "<b>8:00 AM hanggang 5:00 PM.</b> Sarado 12:00–1:00 para sa tanghalian."],
  "por.ab_step_3": ["<b>Bring your patient number</b> (at the top of your portal) or a valid ID.", "<b>Dalhin ang patient number mo</b> (nasa itaas ng portal mo) o isang valid ID."],
  "por.ab_step_4": ["<b>The staff will put you on the schedule</b> — it will show up here in your portal.", "<b>Ang staff ang maglalagay ng schedule</b> — lalabas ito dito sa portal mo."],
  "por.ab_portal": ["What is the patient portal?", "Ano ang patient portal?"],
  "por.ab_portal_1": ["Here you can see your own <b>appointments, medicines, vaccines and records</b> — and those of your children who are minors.", "Dito mo makikita ang sarili mong <b>appointment, gamot, bakuna at records</b> — pati ang sa mga anak mong menor de edad."],
  "por.ab_portal_2": ["It is for viewing only. Booking, rescheduling and fixing a record happen at the clinic itself, so there is one calendar and nothing is doubled.", "Pang-tingin lang ito. Ang pag-book, pagpalit ng schedule at pag-ayos ng record ay sa clinic mismo, para iisa lang ang kalendaryo at walang magkadoble."],
  "por.ab_account": ["How do I get an account?", "Paano magkaroon ng account?"],
  "por.ab_account_1": ["The clinic makes the account. Ask the staff on your next visit — bring a valid ID.", "Ang clinic ang gumagawa ng account. Hingin sa staff sa susunod mong pagpunta — dala ang valid ID."],
  "por.ab_account_2": ["The first password is temporary. <b>Change it right away</b> after you sign in.", "Pansamantala ang unang password. <b>Palitan ito agad</b> pagka-sign in mo."],
  "por.ab_private": ["Your records are private", "Ang records mo ay pribado"],
  "por.ab_private_1": ["They are protected by the <b>Data Privacy Act of 2012 (RA 10173)</b>. Read the", "Protektado ito ng <b>Data Privacy Act of 2012 (RA 10173)</b>. Basahin ang"],
  "por.ab_and": ["and the", "at ang"],
  "por.ab_emergency": ["<b>This is not for emergencies.</b> In an emergency, go to the nearest hospital or call <b>911</b>.", "<b>Hindi ito para sa emergency.</b> Kung emergency, pumunta sa pinakamalapit na ospital o tumawag sa <b>911</b>."],
};

function pick(req) {
  const s = req.session || {};
  if (LANGS.includes(s.lang)) return s.lang;
  const prefs = s.user && s.user.preferences;
  if (prefs && LANGS.includes(prefs.lang)) return prefs.lang;
  if (s.patient) return "tl";
  return "en";
}

// Plural "s" for English only — Tagalog does not inflect ("3 appointment").
function t(lang, key, vars) {
  const row = D[key];
  let s = row ? row[lang === "tl" ? 1 : 0] : key;
  // The plural first, the values last: a value can be something a person typed
  // (a search), and "{s}" or "{n}" inside it must come out exactly as typed.
  const plural = vars && lang !== "tl" && "n" in vars && Number(vars.n) !== 1 ? "s" : "";
  s = s.split("{s}").join(plural);
  if (vars) {
    // One pass over the string, so a filled-in value is never searched again.
    s = s.replace(/\{([a-z]+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  }
  return s;
}

module.exports = { LANGS, D, pick, t };
