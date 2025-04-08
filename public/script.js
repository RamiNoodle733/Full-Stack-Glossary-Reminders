document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const signupLink = document.getElementById('signup-link');
    const loginLink = document.getElementById('login-link');
    const glossarySection = document.getElementById('glossary-section');
    const loginSection = document.getElementById('login-section');
    const signupSection = document.getElementById('signup-section');

    let remainingWords = [];
    let selectedWordForInterval = null;

    // Toggle between login and signup forms
    signupLink.addEventListener('click', (event) => {
        event.preventDefault();
        loginSection.style.display = 'none';
        signupSection.style.display = 'block';
    });

    loginLink.addEventListener('click', (event) => {
        event.preventDefault();
        signupSection.style.display = 'none';
        loginSection.style.display = 'block';
    });

    // Handle login form submission
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        const response = await fetch('https://islamic-glossary-reminders.onrender.com/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();
        if (data.status === 'ok') {
            localStorage.setItem('token', data.token);
            showGlossarySection();
        } else {
            alert(data.error);
        }
    });

    // Handle signup form submission
    signupForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const username = document.getElementById('signup-username').value;
        const password = document.getElementById('signup-password').value;

        const response = await fetch('https://islamic-glossary-reminders.onrender.com/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();
        if (data.status === 'ok') {
            alert('Signup successful! You can now log in.');
            loginSection.style.display = 'block';
            signupSection.style.display = 'none';
        } else {
            alert(data.error);
        }
    });

    // Show the glossary section after login
    function showGlossarySection() {
        loginSection.style.display = 'none';
        signupSection.style.display = 'none';
        glossarySection.style.display = 'block';
        fetchUserStats();
        fetchRandomWordForInterval();
        checkIfCanCheckIn();
        startCountdown(); // Start the countdown timer
    }

    // Fetch and display the user's total knowledge points, streak, and multiplier
    async function fetchUserStats() {
        const token = localStorage.getItem('token');
        const response = await fetch('https://islamic-glossary-reminders.onrender.com/user-stats', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-access-token': token,
            },
        });
        const data = await response.json();
        console.log('Fetched stats:', data);
        if (data.status === 'ok') {
            document.getElementById('total-points').textContent = data.points.toFixed(2);
            document.getElementById('current-streak').textContent = data.streak;
            document.getElementById('current-multiplier').textContent = data.multiplier.toFixed(2);
        } else {
            alert('Failed to fetch user stats');
        }
    }

    // Fetch and display a random word for the current interval without repetition
    function fetchRandomWordForInterval() {
        const glossary = {
            "'Abd": "A male slave.",
            "'Ad": "An ancient tribe that lived after Noah. It was prosperous, but naughty and disobedient to Allah, so Allah destroyed it with violent destructive westerly wind.",
            "(Ad) Dabur": "Westerly wind.",
            "(Ad) Dajjal": "Pseudo Messiah (Al-Masih-ad-Dajjal) and also Hadith No.649 and 650, Vol.4, Sahih Al-Bukhari.",
            "Adhan": "The call to prayer pronounced loudly to indicate that the time of praying is due. And it is as follows: Allahu Akbar, Allahu-Akbar; Allahu-Akbar, Allahu-Akbar; Ash-hadu an la ilaha ill Allah, Ash-hadu an la ilaha ill Allah; Ash-hadu anna Muhammadan Rasul-Ullah, Ash-hadu anna Muhammadan Rasul-Ullah; Haiya 'alas-Sala(h), Haiya'alas-Sala(h); Haiya 'alal-Falah, Haiya 'alal-Falah; Allahu-Akbar, Allahu-Akbar; La ilaha ill Allah.",
            "Adhkhar or Idhkhir": "A kind of grass well-known for its good smell and is found in Hijaz, Saudi Arabia.",
            "Ahkam": "\"Orders\". According to Islamic Law, there are five kinds of orders: 1. Compulsory (Wajib) 2. Order without obligation (Mustahab) 3. Forbidden (Muharram) 4. Disliked but not forbidden (Makruh) 5. Legal and allowed (Halal)",
            "'Ajwa": "Pressed soft dates (or a kind of dates).",
            "Al-Ahzab": "Confederates.",
            "Al-'Aqiq": "A valley in Al-Madina about seven kilometers west of Al-Madina.",
            "Al-'Amanah": "The trust or the moral responsibility or honesty, and all the duties which Allah has ordained.",
            "Al-'Awamir": "Snakes living in houses.",
            "Al-Bahira": "A milking she-camel, whose milk used to be spared for idols and other false deities.",
            "Al-Baida'": "A place to the south of Al-Madina on the way to Makka.",
            "Al-Bait-ul-Ma'mur": "Allah's House over the seventh heaven.",
            "Al-Batsha": "Grasp.",
            "Al-Fatiha": "The first Surah in the Qur'an.",
            "Al-Firdaus": "The middle and the highest part of Paradise.",
            "Al-Ghaba": "(Literally: the forest) A well-known place near Al-Madina.",
            "Al-Ghurr-ul-Muhajjalun": "A name that will be given on the Day of Resurrection to the Muslims because the parts of their bodies which they used to wash in ablution will shine then.",
            "Al-Haruriyya": "A special unorthodox religious sect.",
            "Al-Hasba": "A place outside Makka where pilgrims go after finishing all the ceremonies of Hajj.",
            "Al-Hijr": "The unroofed portion of the Ka'ba which at present is in the form of a compound towards the north of the Ka'ba.",
            "Al-Hudaibiya": "A well-known place ten miles from Makka on the way to Jeddah.",
            "Al-Ihtiba'": "A sitting posture, putting one's arms around one's legs while sitting on the hips.",
            "Al-Ji'rana": "A place, a few miles from Makka. The Prophet distributed the war booty of the battle of Hunain there, and from there he assumed the state of Ihram to perform 'Umra.",
            "Al-Juhfa": "The Miqat of the people of Sham.",
            "Al-Kaba'ir": "The biggest sins.",
            "Ghazwat-al-Khandaq": "The name of a battle between the early Muslims and the infidels in which the Muslims dug a Khandaq (trench) around Al-Madina to prevent any advance by the enemies.",
            "Al-Kauthar": "A river in Paradise.",
            "Al-Lat & Al-'Uzza": "Well-known idols in Hijaz which used to be worshipped during the Pre-Islamic Period of Ignorance.",
            "Al-Lizam": "The settlement of affairs, in the Hadith, it refers to the battle of Badr, which was the means of settling affairs between the Muslims and the pagans.",
            "Al-Madina": "A well-known town in Saudi Arabia, where the Prophet's mosque is situated.",
            "Al-Maghazi": "Plural of Ghazwa (i.e. holy battle).",
            "Al-Mahassab": "A valley outside Makka sometimes called Khaif Bani Kinana.",
            "Al-Manasi": "A vast plateau on the outskirts of Al-Madina.",
            "Al-Masjid-al-Aqsa": "The great mosque in Jerusalem.",
            "Al-Masjid-al-Haram": "The great mosque in Makka. The Ka'ba is situated in it.",
            "Al-Mut'a": "A temporary marriage which was allowed in the early period of Islam but later abrogated.",
            "Al-Muta'awwilun": "Those who form wrong opinions of Kufr about their Muslim brothers.",
            "Al-Qasama": "The oath taken by 50 men of the tribe of a person who is being accused of killing somebody.",
            "Al-Qaswa'": "The name of the Prophet's (Peace Be Upon Him) she-camel.",
            "Al-Qisas": "Laws of equality in punishment for wounds etc. in retaliation.",
            "Al-Wasil": "One who keeps good relations with his kith and kin.",
            "Al-Yarmuk": "A place in Sham.",
            "Allahu-Akbar": "Allah is the Most Great.",
            "Ama": "A female slave.",
            "Amin": "O Allah, accept our invocation.",
            "Amma Ba'du": "An expression used for separating an introductory from the main topics in a speech; the introductory being usually concerned with Allah's Praises and Glorification. Literally, it means, 'whatever comes after.'",
            "An-Najashi": "Title for the king of Ethiopia.",
            "An-Najash": "A trick of offering a very high price for something without the intention of buying it but just to allure and cheat somebody else who really wants to buy it although it is not worth such a high price.",
            "An-Najwa": "The private talk between Allah and each of His slaves on the Day of Resurrection. It also means a secret counsel or conference or consultation.",
            "Ansari": "The Companions of the Prophet from the inhabitants of Al-Madina, who embraced Islam and supported it and who received and entertained the Muslim emigrants from Makka and other places.",
            "'Anza": "A spear-headed stick.",
            "'Aqiqa": "It is the sacrificing of one or two sheep on the occasion of the birth of a child, as a token of gratitude to Allah.",
            "'Aqra Halqa": "An exclamatory expression, the literal meaning of which is not always meant. It expresses disapproval.",
            "'Arafat": "A famous place of pilgrimage on the south-east of Makka about twenty-five kilometers from it.",
            "Arak": "A tree from which Siwak (toothbrush) is made.",
            "'Ariya (plural 'Araya)": "Bai'-al-'Araya is a kind of sale by which the owner of an 'Ariya is allowed to sell the fresh dates while they are still over the palms by means of estimation, for dried plucked dates.",
            "Ar-Rajm": "Means in Islamic Law to stone to death those married persons who commit the crime of illegal sexual intercourse.",
            "'Arsh": "Compensation given in case of someone's injury caused by another person.",
            "Ar-Ruqya": "Divine Speech recited as a means of curing disease.",
            "'Asaba": "All male relatives of a deceased person, from the father's side.",
            "'Asb": "A kind of Yemeni cloth that is very coarse.",
            "Ash-Shajara": "A well-known place on the way from Al-Madina to Makka.",
            "Ash-Shiqaq": "Difference between husband and wife.",
            "'Ashura": "The 10th of the month of Muharram, the first month in the Islamic calendar.",
            "'Asr": "Afternoon, 'Asr prayer time.",
            "As-Saba": "Easterly wind.",
            "As-Sa'iba": "A she-camel which used to be let loose for free pastures in the name of idols, gods, and false deities.",
            "As-Saum": "The fasting, i.e., to not eat or drink or have sexual relations etc. from before the Adhan of the Fajr (early morning) prayer till the sunset.",
            "As-Sirat": "Sirat originally means 'a road'; it also means the bridge that will be laid across Hell-Fire for the people to pass over on the Day of Judgement.",
            "Ashab As-Suffa": "They were about eighty men or more who used to stay and have religious teachings in the Prophet's mosque in Al-Madina, and they were very poor people.",
            "At-Tan'im": "A place towards the north of Makka outside the sanctuary from where Makkans may assume the state of Ihram to perform 'Umra.",
            "'Aura": "That part of the body which it is illegal to keep naked before others.",
            "'Awali-al-Madina": "Outskirts of Al-Madina at a distance of four or more miles.",
            "Awaqin": "Singular: Uqiyya: 5 Awaqin = 22 Silver Riyals of Yemen or 200 Silver Dirham (i.e. 640 grams approx.).",
            "Awsaq": "Plural of Wasq, which is a measure equal to 60 Sa's = 135 kgms. 1 Sa' = 3 kilograms (approx). It may be less or more.",
            "Ayat": "Proofs, evidences, verses, lessons, signs, revelations, etc.",
            "Ayat-ul-Kursi": "Qur'anic Verse No. 255 of Surat Al-Baqara.",
            "Azlam": "Literally means 'arrows'. Here it means arrows used to seek good luck or a decision, practised by the 'Arabs of Pre-Islamic Period of Ignorance.",
            "Badana": "Plural: Budn. A camel or a cow or an ox driven to be offered as a sacrifice by the pilgrims at the sanctuary of Makka.",
            "Badr": "A place about 150 kilometers to the south of Al-Madina, where the first great battle in Islamic history took place between the early Muslims and the infidels of Quraish.",
            "Badhaq": "A kind of alcoholic drink prepared from grapes.",
            "Bai'a (pledge)": "A pledge given by the citizens etc. to their Imam (Muslim ruler) to be obedient to him according to the Islamic religion.",
            "Bait-ul-Midras": "A place in Al-Madina (and it was a Jewish centre).",
            "Bait-ul-Maqdis": "Bait' literally means 'House': a mosque is frequently called Baitullah (the House of Allah). Bait-ul-Maqdis is the famous mosque in Jerusalem which is regarded as the third greatest mosque in the Islamic world; the first and second being Al-Masjid Al-Haram at Makka and the mosque of the Prophet at Al-Madina, respectively.",
            "Banu Al-Asfar": "The Byzantines.",
            "Balam": "Means an ox.",
            "Barrah": "Pious.",
            "Baqi'": "The cemetery of the people of Al-Madina; many of the companions of the Prophet are buried in it.",
            "Bid'a": "Heresy or any innovated practice in religion.",
            "Bint Labun": "Two-year-old she-camel.",
            "Bint Makhad": "One-year-old she-camel.",
            "Bu'ath": "A place about two miles from Al-Madina where a battle took place between the Ansar tribes of Al-Aus and Al-Khazraj before Islam.",
            "Buraq": "An animal bigger than a donkey and smaller than a horse on which the Prophet went for the Mi'raj (The Ascent of the Prophet to the heavens).",
            "Burd, Burda": "A black square narrow dress.",
            "Burnus": "A hooded cloak.",
            "Burud": "Plural of Barid, which means sixteen Farsakhs.",
            "Buthan": "A valley in Al-Madina.",
            "Caliph": "The Imam or the Muslim ruler.",
            "Caliphate": "The Muslim state.",
            "Daghabis": "Snake cucumbers. It is a plural of Daghbus.",
            "Daiyan": "Allah; it literally means the One Who judges people from their deeds after calling them to account.",
            "Daniq": "A coin equal to one sixth of a Dirham.",
            "Dar-al-Qada'": "Justice House (court).",
            "Day of Nafr": "The 12th or 13th of Dhul-Hijja when the pilgrims leave Mina after performing all the ceremonies of Hajj at 'Arafat, Al-Muzdalifa and Mina.",
            "Dhat-un-Nitaqain": "Asma', the daughter of Abu Bakr. It literally means a woman with two belts. She was named so by the Prophet.",
            "Dhaw-ul-Arham": "Kindred of blood.",
            "Dhu-Mahram": "A male, whom a woman can never marry because of close relationship (e.g. a brother, a father, an uncle etc.); or her own husband.",
            "Dhu-Tuwa": "A well-known well in Makka. In the lifetime of the Prophet, Makka was a small city and this well was outside its precincts. Nowadays, Makka is a larger city, and the well is within its boundaries.",
            "Dhimmi": "A non-Muslim living under the protection of an Islamic government.",
            "Dhul-Hijja": "The twelfth month in the Islamic calendar.",
            "Dhul-Hulaifa": "The Miqat of the people of Al-Madina now called 'Abyar 'Ali.",
            "Dhul-Khalasa": "Al-Ka'ba Al-Yamaniya, a house in Yemen where idols used to be worshipped. It belonged to the tribe of Khath'am and Bajaila.",
            "Dhul-Qa'da": "The eleventh month of the Islamic calendar.",
            "Dhul Qarnain": "A great ruler in the past who ruled all over the world, and was a true believer. His story is mentioned in the Qur'an.",
            "Dibaj": "Pure silk cloth.",
            "Dinar": "An ancient gold coin.",
            "Dirham": "A silver coin weighing 50 grains of barley with cut ends.",
            "Diya (Diyat plural)": "Blood-money (for wounds, killing etc.), compensation paid by the killer to the relatives of the victim (in unintentional cases).",
            "Duha": "Forenoon.",
            "'Eid-al-Adha": "The four-day festival of Muslims starting on the tenth day of Dhul-Hijja.",
            "'Eid-al-Fitr": "The three-day festival of Muslims starting from the first day of Shawwal, the month that follows Ramadan immediately.",
            "Fadak": "A town near Al-Madina.",
            "Fahish": "One who talks evil.",
            "Fai'": "War booty gained without fighting.",
            "Fajr": "Dawn or early morning before sunrise, or morning prayer.",
            "Faqih": "A learned man who can give religious verdicts.",
            "Fara'id": "Share fixed for the relatives of a deceased. Such shares are prescribed in the Qur'an.",
            "Faraq": "A bowl for measuring.",
            "Farida": "Plural: Fara'id. An enjoined duty.",
            "Farruj": "A Qaba' opened at the back.",
            "Farsakh": "A distance of three miles: 1 mile = 6000 Dora = 1760 yards.",
            "Fatah": "A female slave or a young lady.",
            "Fidya": "Compensation for a missed or wrongly practised religious ceremony, usually in the form of money or foodstuff or offering (animal).",
            "Gharar": "The sale of what is not present, e.g., of unfished fish.",
            "Ghazi": "A Muslim warrior returning after participation in Jihad (Islamic holy war).",
            "Ghazwa": "Plural: Ghazawat. A holy fighting in the cause of Allah consisting of a large army unit with the Prophet himself leading the army.",
            "Ghira": "This word covers a wide meaning: jealousy as regards women, and also it is a feeling of great fury and anger when one's honour and prestige are injured or challenged.",
            "Ghulul": "Stealing from the war booty before its distribution.",
            "Ghuraf": "Special abodes.",
            "Ghusl": "Taking a bath in a ceremonial way. This is necessary for one who is Junub and also on other occasions.",
            "Hadath (Small)": "Passing wind or urine or answering the call of nature.",
            "Hadath (Big)": "Sexual discharge.",
            "Hady": "An animal (a camel, a cow, a sheep or a goat) offered as a sacrifice by the pilgrims.",
            "Hadith": "The statements of the Prophet; i.e., his sayings, deeds, and approvals, etc.",
            "Hais": "A dish made of cooking-butter, dates, and cheese.",
            "Hajj": "Pilgrimage to Makka.",
            "Al-Hajj-al-Akbar": "The day of Nahr, i.e., the 10th of Dhul-Hijja.",
            "Hajj-al-Asghar": "'Umra.",
            "Hajjat-ul-Wada'": "The last Hajj of the Prophet, the year before he died.",
            "Hajj Mabrur": "Hajj accepted by Allah for being perfectly performed according to the Prophet's Sunna and with legally earned money.",
            "Hajj At-Tamattu' and Al-Qiran": "Hajj performed with 'Umra preceding it.",
            "Hajjam": "One who performs cupping.",
            "Halal": "Lawful.",
            "Hanata": "An expression used when you don't want to call somebody by her name. It is used for calling a female.",
            "Hanif": "Pure Islamic Monotheism, worshipping Allah Alone and nothing else.",
            "Haram": "Unlawful, forbidden, and punishable from the viewpoint of religion.",
            "Haram (Sanctuaries)": "Sanctuaries of Makka and Al-Madina.",
            "Haraura": "A town in Iraq.",
            "Harba": "A short spear.",
            "Harj": "Killing.",
            "Harra": "A well-known rocky place in Al-Madina covered with black stones.",
            "Hasir": "A mat made of leaves of date-palms and is as long as (or longer than) a man's stature.",
            "Haya'": "This term covers a large number of concepts. It may mean 'modesty', 'self-respect', 'bashfulness', 'honour', etc. Haya' is of two kinds: good and bad.",
            "Hawala": "The transference of a debt from one person to another.",
            "Hawazin": "A tribe of Quraish.",
            "Henna": "A kind of plant used for dyeing hair, etc.",
            "Hilab": "A kind of scent.",
            "Hima": "A private pasture.",
            "Himyan": "A kind of belt, part of which serves as a purse to keep money in it.",
            "Hiqqa": "A three-year-old she-camel.",
            "Hira'": "A well-known cave in a mountain near Makka.",
            "Houris": "Very fair females created by Allah as such, not from the offspring of Adam, with intense black irises of their eyes and intense white scleras.",
            "Hubal": "The name of an idol in the Ka'ba in the Pre-Islamic Period of Ignorance.",
            "Hubla": "A kind of desert tree.",
            "Huda": "Chanting of camel-drivers keeping time of camel's walk.",
            "Hudud": "Allah's boundary limits for Halal (lawful) and Haram (unlawful).",
            "Hujra": "Courtyard of a dwelling place, or a room.",
            "Hukm": "A judgment of legal decision, especially of Allah.",
            "Hums": "The tribe of Quraish, their offspring, and their allies were called Hums. This word implies enthusiasm and strictness.",
            "Hunain": "A valley between Makka and Ta'if where the battle took place between the Prophet and Quraish pagans.",
            "Hanut": "A kind of scent used for embalming the dead.",
            "'Iddah": "Allah's prescribed period for divorce and marriage, etc.",
            "Iftar": "The opposite of fasting, breaking the fast.",
            "Ihram": "A state in which one is prohibited from practicing certain deeds that are lawful at other times.",
            "Ihsan": "The highest level of deeds and worship, perfection in worship.",
            "Ila'": "The oath taken by a husband that he would not approach his wife for a certain period.",
            "Iliya": "Jerusalem.",
            "Imam": "The person who leads others in the prayer or the Muslim Caliph (or ruler).",
            "Iman": "Faith, Belief.",
            "Imlas": "An abortion caused by being beaten over one's (a pregnant wife's) abdomen.",
            "Inbijaniya": "A woolen garment without marks.",
            "Iqama": "The statements of the Adhan are recited reduced so that the statements that are expressed twice in the Adhan are recited once in Iqama except the last utterance of 'Allahu-Akbar,' The prayer is offered immediately after Iqama has been pronounced.",
            "Iqamat-as-Salat": "The offering of the prayers perfectly.",
            "'Isha'": "Late evening prayer. Its time starts about one and a half hours after sunset, till the middle of night.",
            "Ishtimal-as-Samma": "The wearing of clothes in the following two ways: To cover one shoulder with a garment and leave the other bare, or to wrap oneself in a garment while sitting in such a way that nothing of that garment would cover one's private parts.",
            "Istabraq": "Thick Dibaj (pure silk cloth).",
            "Istihada": "Bleeding from the womb of a woman in between her ordinary periods.",
            "Istihsan": "To give a verdict with a proof from one's heart with satisfaction, and one cannot express it.",
            "Istikhara": "A prayer consisting of two Rakat in which the praying person appeals to Allah to guide him on the right way, regarding a certain deed or situation.",
            "Istisqa'": "A prayer consisting of two Rakat, invoking Allah for rain in seasons of drought.",
            "I'tikaf": "Seclusion in a mosque for the purpose of worshipping Allah only.",
            "Izar": "A sheet worn below the waist to cover the lower half of the body.",
            "Jadha'a": "A four-year-old she-camel.",
            "Jalil": "A kind of good smelling grass grown in Makka.",
            "Jam'": "Al-Muzdalifa, a well-known place near Makka.",
            "Jamra": "A small stone-built pillar in a walled place. There are three Jamras situated at Mina.",
            "Jamrat-al-'Aqaba": "One of the three stone-built pillars situated at Mina. It is situated at the entrance of Mina from the direction of Makka.",
            "Janaba": "The state of a person after having sexual intercourse with his wife or after having a sexual discharge in a wet dream.",
            "Janib": "A good kind of date.",
            "Jihad": "Holy fighting in the Cause of Allah or any other kind of effort to make Allah's Word (Islam) superior.",
            "Jimar": "Plural of Jamra.",
            "Jinn": "A creation, created by Allah from fire, like human beings from mud, and angels from light.",
            "Jizya": "Head tax imposed by Islam on all non-Muslims living under the protection of an Islamic government.",
            "Jubba": "A cloak.",
            "Jumada-ath-Thaniya": "Sixth month of the Islamic calendar.",
            "Jumu'a": "Friday.",
            "Junub": "A person who is in a state of Janaba.",
            "Jurhum": "Name of an Arab tribe.",
            "Ka'ba": "A square stone building in Al-Masjid-al-Haram (the great mosque at Makka) towards which all Muslims turn their faces in prayer.",
            "Kafala": "The pledge given by somebody to a creditor to guarantee that the debtor will be present at a certain specific place to pay his debt or fine, or to undergo a punishment, etc.",
            "Kafir": "The one who disbelieves in Allah, His Messengers, all the angels, all the holy Books, Day of Resurrection, and in the Al-Qadar (Divine Preordainments).",
            "Kanz": "Hoarded up gold, silver, and money, the Zakat of which has not been paid.",
            "Kasafat": "An Arabic verb meaning 'eclipsed', used for a solar eclipse.",
            "Katm": "A plant used for dyeing hair.",
            "Kauthar": "A river in Paradise.",
            "Khadira": "A kind of vegetation.",
            "Khaibar": "A well-known town in the north of Al-Madina.",
            "Khalil": "The one whose love is mixed with one's heart and it is superior to a friend or beloved.",
            "Khaluq": "A kind of perfume.",
            "Khamisa": "A black woollen square blanket with marks on it.",
            "Kharaj": "Zakat imposed on the yield of the land (1/10th or 1/20th).",
            "Khasafa": "An Arabic word meaning 'eclipsed', used for lunar eclipse.",
            "Khawarij": "The people who dissented from the religion and disagreed with the rest of the Muslims.",
            "Khazir": "A special type of dish prepared from barley-flour and meat-soup.",
            "Khazira": "A special dish prepared from white flour, fat, etc.",
            "Khuff": "Leather socks.",
            "Khul'": "A kind of divorce where the wife parts from her husband by giving him a certain compensation or to return back the Mahr which he gave her.",
            "Khumra": "A small mat just sufficient for the face and the hands during prostration.",
            "Khums": "One-fifth of war booty given in Allah's Cause.",
            "Khutba": "Sermon (religious talk).",
            "Khutba of Nikah": "A speech delivered at the time of concluding the marriage contract.",
            "Kuhl": "Antimony eye powder.",
            "Kufa": "A town in Iraq.",
            "Kufr": "It is basically disbelief in any of the articles of Islamic Faith: to believe in Allah (God), His angels, His Messengers, His revealed Books, the Day of Resurrection, and Al-Qadar (Divine Preordainments).",
            "Kuniya": "Calling a man, O 'father of so-and-so!' Or calling a woman, O'mother of so-and-so!' This is a custom of the Arabs.",
            "Kusuf": "Solar eclipse.",
            "La Ilaha ill Allah": "None has the right to be worshipped but Allah.",
            "Labbaika wa Sa'daika": "I respond to Your Call; I am obedient to Your Orders.",
            "Li'an": "An oath taken by both the wife and the husband when he accuses his wife of committing illegal sexual intercourse.",
            "Luqata": "Article or a thing (a pouch or a purse tied with a string) found by somebody other than the owner who has lost it.",
            "Mabrur (Hajj)": "Accepted by Allah for being perfectly performed according to the Prophet's legal ways and with legally earned money.",
            "Maghafir": "A bad smelling gum.",
            "Maghrib": "Sunset, evening prayer.",
            "Mahram": "See Dhu-Mahram.",
            "Mahr": "Bridal-money given by the husband to the wife at the time of marriage.",
            "Makruh": "Not approved of, undesirable from the point of view of religion, although not punishable.",
            "Mamluk": "A male slave.",
            "Manasik": "Ceremonial acts of Hajj and 'Umra including Ihram, Tawaf of the Ka'ba and Sa'y of As-Safa and Al-Marwa, stay at 'Arafat, Muzdalifa, Mina, Ramy of Jamrats, and slaughtering of Hady (animal).",
            "Maniha (plural Mana'ih)": "A sort of gift in the form of a she-camel or a sheep given temporarily to somebody so that its milk may be used, and then the animal is returned to its owner.",
            "Maqam Ibrahim": "The stone on which Abraham stood while he and Ishmael were building the Ka'ba.",
            "Al-Maqam-al-Mahmud": "The highest place in Paradise, which will be granted to Prophet Muhammad and none else.",
            "Mar'as": "A place nearer to Mina than Ash-Shajara.",
            "Al-Marwa": "A mountain in Makka, neighboring the great mosque (i.e., Al-Masjid-al-Haram).",
            "Masha' Allah": "An Arabic phrase meaning 'What Allah wills,' and it indicates a good omen.",
            "Masjid": "Mosque.",
            "Mashruba": "Attic room.",
            "Mathani": "Oft repeated Verses of the Qur'an, particularly Surat Al-Fatiha, recited repeatedly in prayer.",
            "Maula": "It has many meanings, including a manumitted slave, a master, or the Lord (Allah).",
            "Maulaya": "My lord, my master (an expression used when a slave addresses his master, also used for a freed slave).",
            "Mayathir": "Silk cushions.",
            "Mijanna": "A place at Makka.",
            "Mina": "A place outside Makka on the road to 'Arafat. It is five miles away from Makka and about 10 miles from 'Arafat.",
            "Miqat (plural Mawaqit)": "One of the several places specified by the Prophet for people to assume Ihram at, on their way to Makka, when intending to perform Hajj or 'Umra.",
            "Miracles": "Of the Prophet. See Sahih Al-Bukhari, Vol 1, 'Introduction'.",
            "Mi'raj": "The ascent of the Prophet to the heavens.",
            "Mirbad": "A place where dates are dried.",
            "Misr": "Egypt.",
            "Miswak": "A toothbrush made of Arak-tree roots.",
            "Mithqal": "A special kind of weight (equals 4 2/7 grams approx., used for weighing gold).",
            "Muhkam": "Qur'anic Verses the orders of which are not canceled (abrogated).",
            "Mu'adh-dhin": "A call-maker who pronounces the Adhan loudly, calling people to come and perform the prayer.",
            "Mu'awwidhat": "Surat Al-Falaq (113) and Surat An-Nas (114) of the Qur'an.",
            "Mubashshirat": "Glad tidings.",
            "Mubiqat": "Great destructive sins.",
            "Mudabbar": "A slave who is promised by his master to be manumitted after the latter's death.",
            "Mudd": "A measure of two-thirds of a kilogram (approx.).",
            "Mufassal or Mufassalat": "The Surahs starting from 'Qaf to the end of the Qur'an (i.e., from No. 50 to the end of the Qur'an 114).",
            "Muhajir": "Anyone of the early Muslims who had migrated from any place to Al-Madina in the life-time of the Prophet before the conquest of Makka.",
            "Muhrim": "One who assumes the state of Ihram for the purpose of performing the Hajj or 'Umra.",
            "Muhrima": "A female in the state of Ihram.",
            "Muhsar": "A Muhrim who intends to perform the Hajj or 'Umra but cannot because of some obstacle.",
            "Mujahid": "A Muslim warrior in Jihad.",
            "Mujazziz": "A Qa'if: a learned man who reads the foot and hand marks.",
            "Mujtahidun": "Independent religious scholars who do not follow religious opinions except with proof from the Qur'an and the Prophet's Sunna.",
            "Mukatab": "A slave (male or female) who binds himself or herself to pay a certain ransom for his or her freedom.",
            "Mula'ana": "The act of performing Li'an.",
            "Mulhidun": "Heretical.",
            "Muqaiyar": "A name of a pot in which alcoholic drinks used to be prepared.",
            "Musalla": "A praying place.",
            "Mushrikun": "Polytheists, pagans, idolaters, and disbelievers in the Oneness of Allah and His Messenger Muhammad.",
            "Mustahada": "A woman who has bleeding from the womb in between her ordinary periods.",
            "Mutafahhish": "A person who conveys evil talk.",
            "Mu'takif": "One who is in a state of I'tikaf.",
            "Mutashabihat": "Qur'anic Verses which are not clear and are difficult to understand.",
            "Mutras": "A Persian word meaning 'don't be afraid.'",
            "Muttaqun": "Pious and righteous persons who fear Allah much and love Allah much.",
            "Muzabana": "The sale of fresh dates for dried dates by measure, and the sale of fresh grapes for dried grapes by measure.",
            "Muzaffat": "A name of a pot in which alcoholic drinks used to be prepared.",
            "Muzdalifa": "A place between 'Arafat and Mina where the pilgrims, while returning from 'Arafat, have to stop and stay for the whole night or greater part of it, between the ninth and tenth of Dhul-Hijja.",
            "Muharram": "The first month of the Islamic calendar.",
            "Nabidh": "Water in which dates or grapes etc. are soaked and is not yet fermented.",
            "Nafr (day of)": "The 12th and 13th of Dhul-Hijja when the pilgrims leave Mina after performing all the ceremonies of Hajj.",
            "Nahd": "Sharing the expenses of a journey or putting the journey food of the travelers together to be distributed among them in equal shares.",
            "Nahr": "Literal: slaughtering of the camels only and is done by cutting the carotid artery at the root of the neck; the day of Nahr is the tenth of Dhul-Hijja on which pilgrims slaughter their sacrifices.",
            "Nadiha": "A camel used for agricultural purposes.",
            "Nady": "A part of an arrow.",
            "Namima": "Calumnies, conveyance of disagreeable false information from one person to another to create hostility between them.",
            "Naqib (s)": "A person heading a group of six persons in an expedition, tribal chiefs.",
            "Naqir": "A name of a pot in which alcoholic drinks used to be prepared.",
            "Nasl": "A part of an arrow.",
            "Nawafil": "Plural of Nafila, optional practice of worship in contrast to obligatory (Farida).",
            "Nikah": "Marriage (wedlock) according to Islamic law.",
            "Nisab": "Minimum amount of property liable to payment of the Zakat, e.g., Nisab of gold is twenty (20) Mithqal, i.e., approx. 94 grams; Nisab of silver is two hundred (200) Dirhams, i.e., approx. 640 grams.",
            "Nun": "Fish.",
            "Nusk": "Religious act of worship.",
            "Nusub": "Singular of Ansab. An-Nusub were stone altars at fixed places or graves whereon sacrifices were slaughtered during fixed periods of occasions and seasons in the name of idols, jinns, angels, pious men, saints, etc.",
            "Nusuk": "A sacrifice.",
            "Prophet": "A person who is inspired divinely.",
            "Qaba'": "An outer garment with full-length sleeves.",
            "Qadar": "Divine Pre-Ordainment.",
            "Lailat-ul-Qadr": "One of the odd last ten nights of the month of fasting (i.e., Ramadan), Allah describes it as better than one thousand months.",
            "Qalib": "A well.",
            "Qari'": "Early Muslim religious scholar was called Qurra'. This word is also used for a person who knows the Qur'an by heart.",
            "Qarin": "One who performs Hajj-al-Qiran.",
            "Qarn-al-Manazil": "The Miqat of the people of Najd.",
            "Qasab": "Pipes made of gold, pearls, and other precious stones.",
            "Qatifa": "Thick soft cloth.",
            "Qattat": "A person who conveys information from someone to another with the intention of causing harm and enmity between them.",
            "Qiblah": "The direction in which all Muslims turn their faces in prayers and that direction is towards the Ka'ba in Makka.",
            "Qil and Qal": "Sinful, useless talk (e.g., backbiting, lies, etc.).",
            "Qintar": "A weight-measure for food-grains, etc., e.g., wheat, maize, oat, barley.",
            "Qiram": "A thin marked woolen curtain.",
            "Qirat": "A special weight; sometimes a very great weight like Uhud mountain. 1 Qirat = 1/2 Daniq & 1 Daniq = 1/6 Dirham.",
            "Qissi": "A kind of cloth containing silk; some say it is called so because it is manufactured in Egypt at a place called Qiss.",
            "Qitham": "A plant disease that causes fruit to fall before ripening.",
            "Qiyam": "The standing posture in prayer.",
            "Qiyas": "Verdicts and judgments given by the Islamic religious scholars based on analogy.",
            "Quba'": "A place on the outskirts of Al-Madina. The Prophet established a mosque there.",
            "Qudhadh": "A part of an arrow.",
            "Qumqum": "A narrow-headed vessel.",
            "Qunut": "Invocation in the prayer.",
            "Quraish": "One of the greatest tribes in Arabia in the Pre-Islamic Period of Ignorance. The Prophet Muhammad belonged to this tribe.",
            "Quraishi": "A person belonging to the Quraish tribe.",
            "Rabb": "Lord, Owner (it is also one of the Names of Allah).",
            "Rabbuk": "Your Lord, Your Master.",
            "Rabi'-ul-Awwal": "Third month of the Islamic calendar.",
            "Rahila": "A she-camel used for riding.",
            "Raiyan": "The name of one of the gates of Paradise through which the people who often observe fasting will enter.",
            "Rajab": "The seventh month of the Islamic calendar.",
            "Rajaz": "Name of poetic meter.",
            "Rak'a": "The prayer of Muslims consists of Rak'at (singular-Rak'a), which consists of one standing, one bowing, and two prostrations.",
            "Ramadan": "The month of fasting. It is the ninth month of the Islamic calendar.",
            "Ramal": "Fast walking accompanied by the movements of the arms and legs to show one's physical strength during the Tawaf around the Ka'ba.",
            "Ramy": "The throwing of pebbles at the Jimar at Mina.",
            "Riba' (Usury)": "Usury which is of two major kinds: (a) Riba' Nasi'a, i.e., interest on lent money; (b) Riba' Fadl, i.e., taking a superior thing of the same kind of goods by giving more of the same kind of goods of inferior quality.",
            "Rida'": "A piece of cloth worn around the upper part of the body.",
            "Rikaz": "Buried wealth (from the pre-Islamic period).",
            "Ruh-ul-Lah": "According to the early religious scholars, it means a soul created by Allah.",
            "Ruqba": "A kind of gift in the form of a house given to somebody to live in as long as he is alive.",
            "Sa'": "A measure that equals four Mudds (3 kg. approx).",
            "Sab'a-al-Mathani": "The seven repeatedly recited Verses, i.e., Surat Al-Fatiha.",
            "Sabahah": "An exclamation indicating an appeal for help.",
            "Sabi'un": "A passed nation that lived in Iraq, said La Ilaha ill Allah, and used to read Az-Zabur (The Psalms of the Sabi'uns).",
            "Sa'dan": "A thorny plant suitable for grazing animals.",
            "Sadaqa": "Anything given in charity.",
            "As-Safa and Al-Marwa": "Two mountains at Makka neighboring Al-Masjid-Al-Haram (the great mosque).",
            "Sahba": "A place near Khaibar.",
            "Sahw": "Forgetting how many Rak'at a person has prayed in which case he should perform two prostrations of Sahw.",
            "Sahur": "A meal taken at night before the Fajr prayer by a fasting person.",
            "Sa'y": "The going for seven times between the mountains of As-Safa and Al-Marwa in Makka during the performance of Hajj and 'Umra.",
            "Sayyid": "Master (it is also used as a title name of the descendants of the Prophet).",
            "Sayyidi": "My master.",
            "Sakinah": "Tranquility, calmness, peace, and reassurance.",
            "Salab": "Belongings (arms, horse, etc.) of a deceased warrior killed in a battle.",
            "Salaf": "A sale in which the price is paid at once for goods to be delivered later.",
            "Salam": "Synonym of Salaf.",
            "Sami' Allahu Liman Hamidah": "Allah heard him who sent his praises to Him.",
            "Samur": "A kind of tree.",
            "Sanah": "Means 'good' in the Ethiopian language.",
            "Sariya": "A small army-unit sent by the Prophet for Jihad, without his participation in it.",
            "Sarif": "A place six miles away from Makka.",
            "Sawiq": "A kind of mash made of powdered roasted wheat or barley grain (also with sugar and dates).",
            "Sha'ban": "The eighth month of the Islamic calendar.",
            "Sham": "The region comprising Syria, Palestine, Lebanon, and Jordan.",
            "Shawwal": "The tenth month of the Islamic calendar.",
            "Shighar": "A type of marriage in which persons exchange their daughters or sisters in marriage without Mahr.",
            "Shirak": "A leather strap.",
            "Shirk": "Polytheism and it is to worship others along with Allah.",
            "Shuf'a": "Pre-emption.",
            "Siddiq and Siddiqun": "Those followers of the Prophets who were first and foremost to believe in them.",
            "Sidr": "Lote tree (or Nabk tree).",
            "Sidrat-ul-Muntaha": "A Nabk tree over the seventh heaven near the Paradise.",
            "Siffin (battle of)": "A battle that took place between 'Ali's followers and Mu'awiya's followers at the river of the Euphrates in 'Iraq.",
            "Siwak": "A piece of a root of a tree called Al-Arak, used as a toothbrush.",
            "Subhan Allah": "To honor Allah and make Him free from all that unsuitable evil things that are ascribed to Him.",
            "Suhuliya": "A cotton cloth, its name is derived from the name of a village in Yemen called Suhul.",
            "Sundus": "A kind of silk cloth.",
            "Sunna (legal ways)": "Literally means legal ways, orders, acts of worship, and statements of the Prophet, that have become models to be followed by the Muslims.",
            "Sutra": "An object like a pillar, wall, or stick, a spear, etc., the height of which should not be less than a foot and must be in front of a praying person to act as a symbolical barrier between him and the others.",
            "Taba (Taiba)": "Another name for Al-Madina.",
            "Tabuk": "A well-known town about 700 kilometers north of Al-Madina.",
            "Taghut": "The word Taghut covers a wide range of meanings: anything worshipped other than the Real God (Allah).",
            "Tahajjud": "Night optional prayers offered at any time after Isha prayers and before the Fajr prayer.",
            "Tahnik": "The Islamic customary process of chewing a piece of date, etc., and putting a part of its juice in the child's mouth and pronouncing Adhan in the child's ears.",
            "Taiba": "One of the names of Al-Madina city.",
            "Ta'if": "A well-known town near Makka.",
            "Takbir": "Saying Allahu-Akbar (Allah is the Most Great).",
            "Takbira": "A single utterance of Allahu-Akbar.",
            "Talbina": "A dish prepared from flour and honey.",
            "Talbiya": "Saying Labbaik, Allahumma Labbaik (O Allah! I am obedient to Your Orders, I respond to Your Call).",
            "Taqlid": "Putting colored garlands around the necks of Budn (animals for sacrifice).",
            "Taribat Yaminuka": "An expression of exhortation, meaning, 'May your right hand be in dust,' which implies a loss if you do not do as told.",
            "Tarwiya (day of)": "The eighth day of Dhul-Hijja, when pilgrims start going to Mina.",
            "Tarawih": "Optional prayers offered after the Isha prayers on the nights of Ramadan.",
            "Tashah-hud": "The recitation of the invocation: At-tahiyyatu Lillahi... while in Qu'ud (sitting posture) in prayer.",
            "Tashriq (days of)": "11th, 12th, and 13th of Dhul-Hijja.",
            "Tashmit": "May Allah bestow His Blessings upon you.",
            "Taslim": "On finishing the prayer, one turns one's face to the right and then to the left, saying, 'Assalamu 'Alaikum wa Rahmatullah' (Peace and Mercy of Allah be on you).",
            "Tauhid": "It has three aspects: Oneness of the Lordship of Allah, Oneness of the worship of Allah, and Oneness of the Names and the Qualities of Allah.",
            "Tawaf": "The circumambulation of the Ka'ba.",
            "Tawaf-al-Ifada": "The circumambulation of the Ka'ba by the pilgrims after they come from Mina on the tenth day of Dhul-Hijja.",
            "Tawaf-ul-Wada'": "The Tawaf made before leaving Makka.",
            "Tayammum": "To put or strike lightly the hands over clean earth and then pass the palm of each on the back of the other and then pass them on the face, performed instead of ablution or Ghusl when water is unavailable.",
            "Thaniyat-al-Wada'": "A place near Al-Madina.",
            "Tharid": "A kind of meal prepared from meat and bread.",
            "Thaur": "A well-known mountain in Al-Madina.",
            "Tila'": "A kind of alcoholic drink prepared from grapes.",
            "Tubban": "Shorts that cover the knees, used by wrestlers.",
            "Tulaqa'": "Those persons who had embraced Islam on the day of the conquest of Makka.",
            "Tur": "A mountain.",
            "Uhud": "A well-known mountain in Al-Madina, where one of the great battles in Islamic history took place.",
            "'Umra": "A visit to Makka during which one performs the Tawaf around the Ka'ba and the Sa'y between As-Safa and Al-Marwa.",
            "Umm-al-Walad": "A slave woman who begets a child for her master.",
            "Uqiya": "128 grams. It may be less or more according to different countries.",
            "'Urfut": "The tree which produces Maghafir.",
            "'Ushr": "One-tenth of the yield of land to be levied for public assistance (Zakat).",
            "Waihaka": "May Allah be Merciful to you.",
            "Wailaka": "'Woe upon you!'",
            "Wala'": "A kind of relationship between the master who freed a slave and the freed slave.",
            "Wali [plural Auliya]": "Protector, Guardian, Supporter, Helper, Friend, etc.",
            "Walima": "The marriage banquet.",
            "Waqf": "Religious endowment.",
            "Wars": "A kind of perfume.",
            "Wasaya": "Wills or testaments.",
            "Wasq": "A measure equal to 60 Sa's = 135 kg. approx.",
            "Wisal": "Fasting for more than one day continuously.",
            "Witr": "An odd number of Rak'at with which one finishes one's prayers at night after the night prayer or the Isha prayer.",
            "Yakhsifan": "Eclipse.",
            "Yalamlam": "The Miqat of the people of Yemen.",
            "Yamama": "A place in Saudi Arabia towards Najd.",
            "Yaqin": "Perfect absolute Faith.",
            "Yathrib": "One of the names of Al-Madina.",
            "Zakat": "A certain fixed proportion of the wealth and of the property liable to Zakat of a Muslim to be paid yearly for the benefit of the poor in the Muslim community. The payment of Zakat is obligatory as it is one of the five pillars of Islam.",
            "Zakat-ul-Fitr": "An obligatory Sadaqa to be given by Muslims before the prayer of 'Eid-ul-Fitr.",
            "Zamzam": "The sacred well inside the Haram (the grand mosque) at Makka.",
            "Zanadiqa": "Atheists.",
            "Zarnab": "A kind of good smelling grass.",
            "Zuhr": "Noon, mid-day prayer is called Zuhr prayer."
        };

        const currentTime = new Date();
        let currentInterval;

        if (currentTime.getHours() >= 4 && currentTime.getHours() < 12) {
            currentInterval = 'morning';
        } else if (currentTime.getHours() >= 12 && currentTime.getHours() < 20) {
            currentInterval = 'afternoon';
        } else {
            currentInterval = 'evening';
        }

        // Check if a word has already been selected for this interval
        const savedWordForInterval = localStorage.getItem(`word_${currentInterval}`);

        if (savedWordForInterval) {
            selectedWordForInterval = JSON.parse(savedWordForInterval);
        } else {
            if (remainingWords.length === 0) {
                remainingWords = Object.keys(glossary); // Reset and shuffle
                shuffleArray(remainingWords);
            }

            selectedWordForInterval = remainingWords.pop();
            localStorage.setItem(`word_${currentInterval}`, JSON.stringify(selectedWordForInterval));
        }

        document.getElementById('glossary-word').textContent = `${selectedWordForInterval}: ${glossary[selectedWordForInterval]}`;
    }

    // Function to shuffle an array
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // Check if the user can check in
    async function checkIfCanCheckIn() {
        const token = localStorage.getItem('token');
        const response = await fetch('https://islamic-glossary-reminders.onrender.com/can-check-in', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-access-token': token,
            },
        });

        const data = await response.json();
        const checkInButton = document.getElementById('check-in-button');

        if (data.status === 'ok') {
            checkInButton.classList.remove('disabled');
            checkInButton.disabled = false;
        } else {
            checkInButton.classList.add('disabled');
            checkInButton.disabled = true;
        }
    }

    // Check-in functionality to update knowledge points
    document.getElementById('check-in-button').addEventListener('click', async () => {
        if (document.getElementById('check-in-button').classList.contains('disabled')) return;

        const token = localStorage.getItem('token');
        const response = await fetch('https://islamic-glossary-reminders.onrender.com/update-points', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-access-token': token,
            },
        });

        const data = await response.json();
        if (data.status === 'ok') {
            alert('Knowledge points updated!');
            fetchUserStats(); // Refresh points, streak, and multiplier after check-in
            checkIfCanCheckIn(); // Check if the button should be hidden
        } else {
            alert('Check-in failed');
        }
    });

    // Start the countdown timer for the next word
    function startCountdown() {
        const nextWordTime = new Date();
        if (nextWordTime.getHours() >= 4 && nextWordTime.getHours() < 12) {
            nextWordTime.setHours(12, 0, 0, 0);
        } else if (nextWordTime.getHours() >= 12 && nextWordTime.getHours() < 20) {
            nextWordTime.setHours(20, 0, 0, 0);
        } else {
            nextWordTime.setHours(4, 0, 0, 0);
            nextWordTime.setDate(nextWordTime.getDate() + 1);
        }

        function updateCountdown() {
            const now = new Date();
            const remainingTime = nextWordTime - now;

            const hours = Math.floor(remainingTime / (1000 * 60 * 60));
            const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);

            document.getElementById('next-word-timer').textContent = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            if (remainingTime < 0) {
                clearInterval(timerInterval);
                location.reload(); // Reload the page when the time expires to fetch the new word
            }
        }

        updateCountdown();
        const timerInterval = setInterval(updateCountdown, 1000);
    }
});
