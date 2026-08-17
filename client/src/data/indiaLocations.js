/**
 * States / union territories of India with their major delivery cities.
 *
 * The city lists are the commonly served towns per state, not an exhaustive
 * census — the address form pairs them with an "Other" escape hatch so a
 * shopper in a smaller town can still type their city by hand.
 */
export const CITIES_BY_STATE = {
  'Andhra Pradesh': [
    'Anantapur', 'Chittoor', 'Eluru', 'Guntur', 'Kadapa', 'Kakinada', 'Kurnool',
    'Nellore', 'Rajahmundry', 'Tirupati', 'Vijayawada', 'Visakhapatnam', 'Vizianagaram',
  ],
  'Arunachal Pradesh': ['Itanagar', 'Naharlagun', 'Pasighat', 'Tawang', 'Ziro'],
  Assam: [
    'Bongaigaon', 'Dibrugarh', 'Dhubri', 'Guwahati', 'Jorhat', 'Nagaon',
    'Silchar', 'Tezpur', 'Tinsukia',
  ],
  Bihar: [
    'Ara', 'Begusarai', 'Bhagalpur', 'Bihar Sharif', 'Chapra', 'Darbhanga', 'Gaya',
    'Katihar', 'Munger', 'Muzaffarpur', 'Patna', 'Purnia', 'Saharsa', 'Sasaram',
  ],
  Chhattisgarh: [
    'Ambikapur', 'Bhilai', 'Bilaspur', 'Durg', 'Jagdalpur', 'Korba', 'Raigarh', 'Raipur', 'Rajnandgaon',
  ],
  Goa: ['Margao', 'Mapusa', 'Panaji', 'Ponda', 'Vasco da Gama'],
  Gujarat: [
    'Ahmedabad', 'Anand', 'Bharuch', 'Bhavnagar', 'Bhuj', 'Gandhinagar', 'Jamnagar',
    'Junagadh', 'Mehsana', 'Nadiad', 'Navsari', 'Porbandar', 'Rajkot', 'Surat',
    'Vadodara', 'Valsad', 'Vapi',
  ],
  Haryana: [
    'Ambala', 'Bahadurgarh', 'Bhiwani', 'Faridabad', 'Gurugram', 'Hisar', 'Jind',
    'Karnal', 'Kurukshetra', 'Panchkula', 'Panipat', 'Rewari', 'Rohtak', 'Sirsa', 'Sonipat', 'Yamunanagar',
  ],
  'Himachal Pradesh': [
    'Baddi', 'Bilaspur', 'Dharamshala', 'Kullu', 'Mandi', 'Nahan', 'Palampur', 'Shimla', 'Solan', 'Una',
  ],
  Jharkhand: [
    'Bokaro Steel City', 'Deoghar', 'Dhanbad', 'Giridih', 'Hazaribagh', 'Jamshedpur',
    'Phusro', 'Ramgarh', 'Ranchi',
  ],
  Karnataka: [
    'Ballari', 'Belagavi', 'Bengaluru', 'Bidar', 'Chikkamagaluru', 'Davanagere', 'Dharwad',
    'Hassan', 'Hubballi', 'Kalaburagi', 'Mandya', 'Mangaluru', 'Mysuru', 'Raichur',
    'Shivamogga', 'Tumakuru', 'Udupi', 'Vijayapura',
  ],
  Kerala: [
    'Alappuzha', 'Kannur', 'Kasaragod', 'Kochi', 'Kollam', 'Kottayam', 'Kozhikode',
    'Malappuram', 'Palakkad', 'Pathanamthitta', 'Thalassery', 'Thrissur',
    'Thiruvananthapuram', 'Wayanad',
  ],
  'Madhya Pradesh': [
    'Bhopal', 'Burhanpur', 'Chhindwara', 'Dewas', 'Gwalior', 'Indore', 'Jabalpur',
    'Katni', 'Khandwa', 'Ratlam', 'Rewa', 'Sagar', 'Satna', 'Singrauli', 'Ujjain', 'Vidisha',
  ],
  Maharashtra: [
    'Ahmednagar', 'Akola', 'Amravati', 'Aurangabad', 'Chandrapur', 'Dhule', 'Jalgaon',
    'Kolhapur', 'Latur', 'Mumbai', 'Nagpur', 'Nanded', 'Nashik', 'Navi Mumbai',
    'Panvel', 'Pune', 'Sangli', 'Satara', 'Solapur', 'Thane', 'Vasai-Virar',
  ],
  Manipur: ['Bishnupur', 'Churachandpur', 'Imphal', 'Thoubal', 'Ukhrul'],
  Meghalaya: ['Baghmara', 'Jowai', 'Nongstoin', 'Shillong', 'Tura'],
  Mizoram: ['Aizawl', 'Champhai', 'Kolasib', 'Lunglei', 'Serchhip'],
  Nagaland: ['Dimapur', 'Kohima', 'Mokokchung', 'Tuensang', 'Wokha', 'Zunheboto'],
  Odisha: [
    'Balasore', 'Baripada', 'Berhampur', 'Bhadrak', 'Bhubaneswar', 'Cuttack',
    'Jharsuguda', 'Puri', 'Rourkela', 'Sambalpur',
  ],
  Punjab: [
    'Amritsar', 'Bathinda', 'Firozpur', 'Hoshiarpur', 'Jalandhar', 'Kapurthala',
    'Ludhiana', 'Mohali', 'Moga', 'Pathankot', 'Patiala', 'Phagwara',
  ],
  Rajasthan: [
    'Ajmer', 'Alwar', 'Banswara', 'Beawar', 'Bharatpur', 'Bhilwara', 'Bikaner',
    'Chittorgarh', 'Jaipur', 'Jaisalmer', 'Jhunjhunu', 'Jodhpur', 'Kota', 'Pali',
    'Sikar', 'Sri Ganganagar', 'Udaipur',
  ],
  Sikkim: ['Gangtok', 'Gyalshing', 'Mangan', 'Namchi', 'Rangpo'],
  'Tamil Nadu': [
    'Chennai', 'Coimbatore', 'Cuddalore', 'Dindigul', 'Erode', 'Hosur', 'Kanchipuram',
    'Karur', 'Madurai', 'Nagercoil', 'Salem', 'Thanjavur', 'Thoothukudi', 'Tiruchirappalli',
    'Tirunelveli', 'Tiruppur', 'Vellore',
  ],
  Telangana: [
    'Adilabad', 'Hyderabad', 'Karimnagar', 'Khammam', 'Mahbubnagar', 'Nalgonda',
    'Nizamabad', 'Ramagundam', 'Secunderabad', 'Suryapet', 'Warangal',
  ],
  Tripura: ['Agartala', 'Ambassa', 'Belonia', 'Dharmanagar', 'Kailashahar', 'Udaipur'],
  'Uttar Pradesh': [
    'Agra', 'Aligarh', 'Prayagraj', 'Bareilly', 'Firozabad', 'Ghaziabad', 'Gorakhpur',
    'Jhansi', 'Kanpur', 'Lucknow', 'Mathura', 'Meerut', 'Moradabad', 'Muzaffarnagar',
    'Noida', 'Rampur', 'Saharanpur', 'Varanasi',
  ],
  Uttarakhand: [
    'Dehradun', 'Haldwani', 'Haridwar', 'Kashipur', 'Nainital', 'Rishikesh',
    'Roorkee', 'Rudrapur',
  ],
  'West Bengal': [
    'Asansol', 'Bardhaman', 'Darjeeling', 'Durgapur', 'Haldia', 'Howrah', 'Kharagpur',
    'Kolkata', 'Malda', 'Siliguri',
  ],

  // Union territories
  'Andaman and Nicobar Islands': ['Port Blair', 'Mayabunder', 'Rangat'],
  Chandigarh: ['Chandigarh'],
  'Dadra and Nagar Haveli and Daman and Diu': ['Daman', 'Diu', 'Silvassa'],
  Delhi: ['Central Delhi', 'Dwarka', 'East Delhi', 'New Delhi', 'North Delhi', 'Rohini', 'South Delhi', 'West Delhi'],
  'Jammu and Kashmir': ['Anantnag', 'Baramulla', 'Jammu', 'Kathua', 'Srinagar', 'Udhampur'],
  Ladakh: ['Kargil', 'Leh'],
  Lakshadweep: ['Kavaratti', 'Agatti', 'Minicoy'],
  Puducherry: ['Karaikal', 'Mahe', 'Puducherry', 'Yanam'],
};

export const INDIAN_STATES = Object.keys(CITIES_BY_STATE).sort((a, b) => a.localeCompare(b));

/** Cities for a state, or an empty list when no state is selected yet. */
export function citiesForState(state) {
  return CITIES_BY_STATE[state] || [];
}

/**
 * The postal API answers with a few pre-reorganisation names, so its reply is
 * mapped back onto the canonical spelling used by the dropdown before we try to
 * match it. Keys are lower-cased.
 */
const STATE_ALIASES = {
  'pondicherry': 'Puducherry',
  'orissa': 'Odisha',
  'uttaranchal': 'Uttarakhand',
  'jammu & kashmir': 'Jammu and Kashmir',
  'andaman & nicobar islands': 'Andaman and Nicobar Islands',
  'dadra & nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu',
  'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu',
  'daman & diu': 'Dadra and Nagar Haveli and Daman and Diu',
  'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
};

/**
 * Canonical state name for an arbitrary spelling, or '' when it matches nothing
 * we ship — the caller then leaves the dropdown for the shopper to answer.
 */
export function normaliseState(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return '';
  if (STATE_ALIASES[key]) return STATE_ALIASES[key];
  return INDIAN_STATES.find((state) => state.toLowerCase() === key) || '';
}

/**
 * The postal directory still answers with the pre-rename district for many
 * cities — 560001 comes back as "Bangalore", 605001 as "Pondicherry". Without
 * this the dropdown would fall through to its free-text mode for a city it
 * actually lists. Keys are lower-cased.
 */
const CITY_ALIASES = {
  allahabad: 'Prayagraj',
  bangalore: 'Bengaluru',
  baroda: 'Vadodara',
  belgaum: 'Belagavi',
  bellary: 'Ballari',
  bombay: 'Mumbai',
  calicut: 'Kozhikode',
  chikmagalur: 'Chikkamagaluru',
  cochin: 'Kochi',
  cuddapah: 'Kadapa',
  ernakulam: 'Kochi',
  gulbarga: 'Kalaburagi',
  gurgaon: 'Gurugram',
  hubli: 'Hubballi',
  madras: 'Chennai',
  mangalore: 'Mangaluru',
  mysore: 'Mysuru',
  panjim: 'Panaji',
  pondicherry: 'Puducherry',
  poona: 'Pune',
  shimoga: 'Shivamogga',
  simla: 'Shimla',
  tiruchirapalli: 'Tiruchirappalli',
  trichy: 'Tiruchirappalli',
  trivandrum: 'Thiruvananthapuram',
  tumkur: 'Tumakuru',
  tuticorin: 'Thoothukudi',
  vizag: 'Visakhapatnam',
};

/** The listed city matching `raw` for that state, or '' when it isn't listed. */
export function matchCity(state, raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return '';
  const canonical = (CITY_ALIASES[key] || '').toLowerCase() || key;
  return citiesForState(state).find((city) => city.toLowerCase() === canonical) || '';
}
