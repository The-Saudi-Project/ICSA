/**
 * Homepage copy, in both languages.
 *
 * Kept out of `locales/en.ts` deliberately. Those files hold the strings every
 * screen in the product needs; this is marketing copy for exactly one route, it
 * is roughly the same size again, and it changes on a completely different
 * schedule. Putting the two languages side by side in one file also makes the
 * Arabic reviewable against the English line by line — which matters, because
 * the Arabic is the version most of our buyers will read.
 *
 * Everything here is a claim we can stand behind: no invented statistics, no
 * customer names, no prices, and nothing implying a certification we do not
 * hold.
 */

export interface HomeCopy {
  nav: { how: string; demo: string; features: string; faq: string; contact: string; signIn: string }
  hero: {
    badge: string
    titleLead: string
    titleAccent: string
    subtitle: string
    ctaPrimary: string
    ctaSecondary: string
    reassure: string
  }
  keep: { title: string; body: string; items: string[] }
  how: { eyebrow: string; title: string; subtitle: string; steps: { title: string; body: string }[] }
  demo: {
    eyebrow: string
    title: string
    subtitle: string
    tap: string
    replay: string
    phoneIdle: string
    phoneIdleHint: string
    menuTitle: string
    menuHint: string
    items: { name: string; price: string }[]
    cartTitle: string
    placedTitle: string
    placedBody: string
    kitchenTitle: string
    kitchenTicket: string
    kitchenStatuses: string[]
    readyTitle: string
    readyBody: string
    stepLabels: string[]
  }
  features: { eyebrow: string; title: string; subtitle: string; items: { title: string; body: string }[] }
  surfaces: { eyebrow: string; title: string; subtitle: string; items: { name: string; body: string }[] }
  trust: { eyebrow: string; title: string; subtitle: string; items: { title: string; body: string }[] }
  faq: { eyebrow: string; title: string; items: { q: string; a: string }[] }
  contact: {
    eyebrow: string
    title: string
    subtitle: string
    restaurantName: string
    contactName: string
    phone: string
    email: string
    optional: string
    city: string
    branches: string
    message: string
    messagePlaceholder: string
    submit: string
    sending: string
    successTitle: string
    successBody: string
    errorTitle: string
    errorBody: string
    tooMany: string
    privacy: string
  }
  footer: { tagline: string; rights: string; staff: string; myOrders: string }
}

const en: HomeCopy = {
  nav: {
    how: 'How it works',
    demo: 'See it work',
    features: 'Features',
    faq: 'Questions',
    contact: 'Talk to us',
    signIn: 'Staff sign in',
  },
  hero: {
    badge: 'Built for Saudi restaurants',
    titleLead: 'The table takes the',
    titleAccent: 'order',
    subtitle:
      'Your guest taps the card on the table and your menu opens on their own phone — no app, no account, no table number to type. The order reaches your kitchen the moment they place it.',
    ctaPrimary: 'Talk to us',
    ctaSecondary: 'See it work',
    reassure: 'Keep the POS and the accountant you already have. Simat sits beside them.',
  },
  keep: {
    title: 'You are not replacing anything',
    body: 'Simat is not a POS and it is not accounting software. Your till, your books and your suppliers stay exactly where they are. What changes is the twenty minutes a guest spends waiting to be noticed.',
    items: ['Your POS stays', 'Your accountant stays', 'Your menu, your prices', 'No new hardware'],
  },
  how: {
    eyebrow: 'How it works',
    title: 'Four steps, and nobody downloaded anything',
    subtitle: 'From the guest sitting down to the plate leaving the pass.',
    steps: [
      {
        title: 'They tap the table',
        body: 'An NFC card sits on every table, with a printed QR code for phones that cannot tap. One touch opens your menu in the browser they already have open.',
      },
      {
        title: 'They order at their own pace',
        body: 'Photos, allergens, add-ons, and prices with VAT shown properly. No waving, no waiting for someone to walk past with a notepad.',
      },
      {
        title: 'The kitchen sees it instantly',
        body: 'The ticket appears on the kitchen screen the moment it is placed, with every modifier written out. Nothing is shouted across a service pass.',
      },
      {
        title: 'Your team runs the floor',
        body: 'The waiter screen shows what is ready to carry and which table pressed the call button. The till confirms cash. Every action is recorded against a name.',
      },
    ],
  },
  demo: {
    eyebrow: 'See it work',
    title: 'Press the button. This is the whole thing.',
    subtitle:
      'A simulation of what happens between a guest touching the table and the ticket landing in the kitchen — the real flow, at the real speed.',
    tap: 'Tap the table',
    replay: 'Run it again',
    phoneIdle: 'Tap to order',
    phoneIdleHint: 'Hold your phone near the card',
    menuTitle: 'Najd Grill',
    menuHint: 'Table A2',
    items: [
      { name: 'Lamb Mandi', price: '58.00' },
      { name: 'Grilled Hammour', price: '72.00' },
      { name: 'Mint Lemonade', price: '18.00' },
    ],
    cartTitle: 'Your order',
    placedTitle: 'Order placed',
    placedBody: 'Table A2 · Order #1042',
    kitchenTitle: 'Kitchen screen',
    kitchenTicket: 'Table A2 · #1042',
    kitchenStatuses: ['New', 'Preparing', 'Ready'],
    readyTitle: 'Ready to serve',
    readyBody: 'The waiter screen sounds, and the guest watches it change on their own phone.',
    stepLabels: ['Tap', 'Order', 'Kitchen', 'Ready'],
  },
  features: {
    eyebrow: 'What you get',
    title: 'Five screens, one service',
    subtitle: 'Everything a floor needs during service, and nothing it does not.',
    items: [
      {
        title: 'Tap or scan ordering',
        body: 'NFC cards and printed QR codes for every table. If a tag is ever lost or copied, rotate that table with one click and the old one stops working immediately.',
      },
      {
        title: 'Kitchen display',
        body: 'A dark, high-contrast board readable across a hot kitchen. Accept, prepare, ready — with no prices or payment details anywhere near it.',
      },
      {
        title: 'Cashier and cash',
        body: 'Cash confirmed at the till by a named person, recorded permanently, and impossible to confirm twice when two people click at once.',
      },
      {
        title: 'Waiter floor screen',
        body: 'Plates ready to carry, and tables asking for help — one tap from the guest raises an alert that stays until somebody clears it.',
      },
      {
        title: 'Menu, tables and staff',
        body: 'Edit the menu and prices, add photos, mark a dish sold out mid-service, print QR codes, and give each person exactly the access their job needs.',
      },
      {
        title: 'Arabic and English',
        body: 'Both languages, with proper right-to-left layout — not an English screen with Arabic words pushed into it.',
      },
    ],
  },
  surfaces: {
    eyebrow: 'Who uses what',
    title: 'One system, five points of view',
    subtitle: 'Each screen does one job. Nobody sees what they do not need.',
    items: [
      { name: 'The guest', body: 'Their own phone. Menu, cart, order, live status.' },
      { name: 'The kitchen', body: 'Tickets and timings. No prices, no payments.' },
      { name: 'The till', body: 'Cash confirmation and the day so far.' },
      { name: 'The floor', body: 'Ready plates, and tables calling for a waiter.' },
      { name: 'The owner', body: 'Menu, tables, staff, history, and a record of who did what.' },
    ],
  },
  trust: {
    eyebrow: 'Built carefully',
    title: 'The boring parts, done properly',
    subtitle: 'Things you should not have to ask about — and the honest answer anyway.',
    items: [
      {
        title: 'One restaurant cannot see another',
        body: 'Every record carries its restaurant, and four independent layers refuse a query that forgets it. A branch is a separate tenant with its own menu, staff and numbers.',
      },
      {
        title: 'A table cannot be guessed',
        body: 'Each table carries 32 random bytes, stored hashed, exchanged once for a short-lived session. A wrong, expired or retired tag all answer identically, so nothing can be probed.',
      },
      {
        title: 'Money is never a rounding error',
        body: 'Prices are whole halalas, never decimals, and every total and VAT line is recomputed on the server from your own menu. A price sent by a phone is discarded.',
      },
      {
        title: 'No card details, ever',
        body: 'We never receive, store or log a card number. Card payment arrives through a licensed provider on their hosted page — the details never touch this system.',
      },
    ],
  },
  faq: {
    eyebrow: 'Questions',
    title: 'The ones owners actually ask',
    items: [
      {
        q: 'Do I have to replace my POS?',
        a: 'No, and we would rather you did not. Simat handles ordering at the table; your POS and your accounting stay exactly as they are. Connecting the two directly is on the roadmap, and it is optional.',
      },
      {
        q: 'Does the customer need to install an app?',
        a: 'No. Tapping the card opens a web page in the browser their phone already has. There is no account, no password and no download.',
      },
      {
        q: 'What if their phone has no NFC?',
        a: 'Every card carries a printed QR code as well. Same page, same order, one extra second.',
      },
      {
        q: 'What happens if my internet drops?',
        a: 'Nothing is lost. The staff screens reconnect on their own and catch up, and they keep checking in the background rather than trusting a single live connection.',
      },
      {
        q: 'Can my waiters still take orders themselves?',
        a: 'Yes. A waiter can build an order on their own device for a guest who would rather speak to a person, and it reaches the kitchen through the same path.',
      },
      {
        q: 'What about card payments?',
        a: 'Cash is confirmed at the till today. Card and Mada are being added through a licensed Saudi payment provider on their own hosted page. We will not guess a date for you.',
      },
      {
        q: 'How long does setup take?',
        a: 'Load your menu, print the table cards, and you can take an order the same day. There is no hardware to install and nothing to wire.',
      },
    ],
  },
  contact: {
    eyebrow: 'Talk to us',
    title: 'Tell us about your restaurant',
    subtitle: 'A short message is enough. We read every one, and we reply in the language you wrote in.',
    restaurantName: 'Restaurant name',
    contactName: 'Your name',
    phone: 'Phone or WhatsApp',
    email: 'Email',
    optional: 'optional',
    city: 'City',
    branches: 'Branches',
    message: 'Anything we should know',
    messagePlaceholder: 'How many tables, what you use today, what is not working…',
    submit: 'Send message',
    sending: 'Sending…',
    successTitle: 'Message received',
    successBody: 'Thank you. We will come back to you on the number you gave us.',
    errorTitle: 'That did not send',
    errorBody: 'Please check the fields and try once more.',
    tooMany: 'That is a lot of messages from one place. Please try again in a little while.',
    privacy: 'We use this only to reply to you. It is not shared with anyone.',
  },
  footer: {
    tagline: 'Tap the table — the menu opens on your phone.',
    rights: 'All rights reserved.',
    staff: 'Staff sign in',
    myOrders: 'My orders',
  },
}

const ar: HomeCopy = {
  nav: {
    how: 'كيف يعمل',
    demo: 'شاهده يعمل',
    features: 'المميزات',
    faq: 'أسئلة',
    contact: 'تواصل معنا',
    signIn: 'دخول الموظفين',
  },
  hero: {
    badge: 'صُنع لمطاعم السعودية',
    titleLead: 'الطاولة تأخذ',
    titleAccent: 'الطلب',
    subtitle:
      'يقرّب ضيفك جواله من البطاقة على الطاولة، فتفتح قائمتك على جواله هو — بلا تطبيق، وبلا حساب، وبلا كتابة رقم الطاولة. ويصل الطلب إلى مطبخك في اللحظة نفسها.',
    ctaPrimary: 'تواصل معنا',
    ctaSecondary: 'شاهده يعمل',
    reassure: 'احتفظ بنظام الكاشير والمحاسب لديك. سِماط يعمل بجانبهما لا بدلاً عنهما.',
  },
  keep: {
    title: 'أنت لا تستبدل شيئاً',
    body: 'سِماط ليس نظام كاشير ولا برنامج محاسبة. يبقى الصندوق والدفاتر والموردون كما هم تماماً. ما يتغير هو تلك الدقائق التي يقضيها الضيف في انتظار من ينتبه له.',
    items: ['الكاشير يبقى', 'المحاسب يبقى', 'قائمتك وأسعارك', 'بلا أجهزة جديدة'],
  },
  how: {
    eyebrow: 'كيف يعمل',
    title: 'أربع خطوات، ولم يحمّل أحد أي تطبيق',
    subtitle: 'من جلوس الضيف حتى خروج الطبق من المطبخ.',
    steps: [
      {
        title: 'يقرّب جواله من الطاولة',
        body: 'بطاقة NFC على كل طاولة، ومعها رمز QR مطبوع للأجهزة التي لا تدعم اللمس. لمسة واحدة تفتح قائمتك في المتصفح المفتوح أصلاً بين يديه.',
      },
      {
        title: 'يطلب على راحته',
        body: 'صور ومكوّنات وإضافات، وأسعار مع ضريبة القيمة المضافة موضّحة كما ينبغي. بلا إشارات بيد، وبلا انتظار لمن يمرّ بدفتر.',
      },
      {
        title: 'المطبخ يراه فوراً',
        body: 'تظهر التذكرة على شاشة المطبخ لحظة إرسالها، وكل إضافة مكتوبة بوضوح. لا صياح عبر ممر التقديم ولا سوء فهم.',
      },
      {
        title: 'فريقك يدير الصالة',
        body: 'شاشة النادل تعرض ما جهز للتقديم وأي طاولة ضغطت زر النداء. والكاشير يؤكد النقد. وكل إجراء مسجّل باسم صاحبه.',
      },
    ],
  },
  demo: {
    eyebrow: 'شاهده يعمل',
    title: 'اضغط الزر. هذا هو الأمر كله.',
    subtitle:
      'محاكاة لما يحدث بين لمس الضيف للطاولة ووصول التذكرة إلى المطبخ — المسار نفسه، وبالسرعة نفسها.',
    tap: 'قرّب جوالك',
    replay: 'أعد التشغيل',
    phoneIdle: 'قرّب لتطلب',
    phoneIdleHint: 'قرّب جوالك من البطاقة',
    menuTitle: 'مشاوي نجد',
    menuHint: 'طاولة A2',
    items: [
      { name: 'مندي لحم', price: '58.00' },
      { name: 'هامور مشوي', price: '72.00' },
      { name: 'ليمون بالنعناع', price: '18.00' },
    ],
    cartTitle: 'طلبك',
    placedTitle: 'تم إرسال الطلب',
    placedBody: 'طاولة A2 · طلب 1042',
    kitchenTitle: 'شاشة المطبخ',
    kitchenTicket: 'طاولة A2 · 1042',
    kitchenStatuses: ['جديد', 'قيد التحضير', 'جاهز'],
    readyTitle: 'جاهز للتقديم',
    readyBody: 'تصدر شاشة النادل تنبيهاً، ويرى الضيف الحالة تتغير على جواله.',
    stepLabels: ['اللمس', 'الطلب', 'المطبخ', 'جاهز'],
  },
  features: {
    eyebrow: 'ما الذي تحصل عليه',
    title: 'خمس شاشات، وخدمة واحدة',
    subtitle: 'كل ما تحتاجه الصالة أثناء الخدمة، ولا شيء زائد عنه.',
    items: [
      {
        title: 'الطلب باللمس أو المسح',
        body: 'بطاقات NFC ورموز QR مطبوعة لكل طاولة. وإن فُقدت بطاقة أو نُسخت، تُبدّل تلك الطاولة بضغطة واحدة فتتوقف القديمة في الحال.',
      },
      {
        title: 'شاشة المطبخ',
        body: 'لوحة داكنة عالية التباين تُقرأ من بعيد في مطبخ حار. استلام، تحضير، جاهز — بلا أسعار ولا تفاصيل دفع بقربها.',
      },
      {
        title: 'الكاشير والنقد',
        body: 'يؤكَّد النقد على الصندوق باسم شخص محدد، ويُسجَّل بشكل دائم، ويستحيل تأكيده مرتين إن ضغط اثنان في اللحظة نفسها.',
      },
      {
        title: 'شاشة النادل',
        body: 'الأطباق الجاهزة للتقديم، والطاولات التي تطلب المساعدة — لمسة واحدة من الضيف تُطلق تنبيهاً يبقى حتى يُنهيه أحد.',
      },
      {
        title: 'القائمة والطاولات والموظفون',
        body: 'عدّل القائمة والأسعار، وأضف الصور، وأوقف صنفاً نفد أثناء الخدمة، واطبع رموز QR، وامنح كل شخص الصلاحية التي يحتاجها عمله فقط.',
      },
      {
        title: 'بالعربية والإنجليزية',
        body: 'اللغتان معاً، بتخطيط عربي صحيح من اليمين إلى اليسار — لا شاشة إنجليزية حُشرت فيها كلمات عربية.',
      },
    ],
  },
  surfaces: {
    eyebrow: 'من يستخدم ماذا',
    title: 'نظام واحد، وخمس زوايا نظر',
    subtitle: 'كل شاشة تؤدي عملاً واحداً، ولا أحد يرى ما لا يحتاجه.',
    items: [
      { name: 'الضيف', body: 'جواله هو. القائمة والسلة والطلب والحالة مباشرة.' },
      { name: 'المطبخ', body: 'التذاكر والأوقات. بلا أسعار ولا مدفوعات.' },
      { name: 'الكاشير', body: 'تأكيد النقد وحصيلة اليوم حتى اللحظة.' },
      { name: 'الصالة', body: 'الأطباق الجاهزة، والطاولات التي تنادي النادل.' },
      { name: 'المالك', body: 'القائمة والطاولات والموظفون والسجل ومن فعل ماذا.' },
    ],
  },
  trust: {
    eyebrow: 'مبني بعناية',
    title: 'الأمور المملة، منفَّذة كما ينبغي',
    subtitle: 'أشياء لا يفترض أن تسأل عنها، وإليك الإجابة الصريحة عنها على أي حال.',
    items: [
      {
        title: 'مطعم لا يرى مطعماً آخر',
        body: 'كل سجل يحمل مطعمه، وأربع طبقات مستقلة ترفض أي استعلام ينسى ذلك. والفرع كيان منفصل بقائمته وموظفيه وأرقامه.',
      },
      {
        title: 'الطاولة لا تُخمَّن',
        body: '٣٢ بايت عشوائية لكل طاولة، تُخزَّن مجزّأة، وتُستبدل مرة واحدة بجلسة قصيرة العمر. والبطاقة الخاطئة والمنتهية والملغاة تعطي الرد نفسه تماماً، فلا شيء يمكن تحسّسه.',
      },
      {
        title: 'المال لا يخطئ في الكسور',
        body: 'الأسعار هللات صحيحة لا كسور عشرية، وكل إجمالي وكل سطر ضريبة يُحسب على الخادم من قائمتك أنت. وأي سعر يرسله جوال يُهمَل.',
      },
      {
        title: 'لا بيانات بطاقات إطلاقاً',
        body: 'لا نستقبل رقم بطاقة ولا نخزّنه ولا نسجّله. والدفع بالبطاقة يتم عبر مزوّد مرخّص على صفحته هو — ولا تمر التفاصيل بهذا النظام.',
      },
    ],
  },
  faq: {
    eyebrow: 'أسئلة',
    title: 'ما يسأله الملّاك فعلاً',
    items: [
      {
        q: 'هل يجب أن أستبدل نظام الكاشير؟',
        a: 'لا، ولا نودّ ذلك أصلاً. سِماط يتولى الطلب على الطاولة، ويبقى الكاشير والمحاسبة كما هما. أما الربط المباشر بينهما فهو ضمن الخطة، وهو اختياري.',
      },
      {
        q: 'هل يحتاج الزبون إلى تحميل تطبيق؟',
        a: 'لا. لمس البطاقة يفتح صفحة في المتصفح الموجود أصلاً على جواله. بلا حساب ولا كلمة مرور ولا تحميل.',
      },
      {
        q: 'وماذا لو كان جواله لا يدعم NFC؟',
        a: 'كل بطاقة تحمل رمز QR مطبوعاً أيضاً. الصفحة نفسها والطلب نفسه، بثانية إضافية.',
      },
      {
        q: 'ماذا يحدث إذا انقطع الإنترنت؟',
        a: 'لا يضيع شيء. تعيد شاشات الموظفين الاتصال بنفسها وتلحق ما فاتها، وهي تتحقق باستمرار في الخلفية بدل الاعتماد على اتصال واحد.',
      },
      {
        q: 'هل يستطيع النادل أخذ الطلب بنفسه؟',
        a: 'نعم. يستطيع النادل إنشاء الطلب على جهازه لضيف يفضّل التحدث إلى شخص، ويسلك الطلب المسار نفسه إلى المطبخ.',
      },
      {
        q: 'وماذا عن الدفع بالبطاقة؟',
        a: 'النقد يُؤكَّد على الصندوق اليوم. والبطاقة ومدى قيد الإضافة عبر مزوّد مدفوعات سعودي مرخّص على صفحته الخاصة. ولن نعدك بتاريخ لا نضمنه.',
      },
      {
        q: 'كم يستغرق التجهيز؟',
        a: 'ارفع قائمتك، واطبع بطاقات الطاولات، ويمكنك استقبال طلب في اليوم نفسه. لا أجهزة تُركَّب ولا أسلاك تُمدّ.',
      },
    ],
  },
  contact: {
    eyebrow: 'تواصل معنا',
    title: 'حدثنا عن مطعمك',
    subtitle: 'رسالة قصيرة تكفي. نقرأ كل رسالة، ونردّ باللغة التي كتبت بها.',
    restaurantName: 'اسم المطعم',
    contactName: 'اسمك',
    phone: 'الجوال أو واتساب',
    email: 'البريد الإلكتروني',
    optional: 'اختياري',
    city: 'المدينة',
    branches: 'عدد الفروع',
    message: 'أي شيء ينبغي أن نعرفه',
    messagePlaceholder: 'كم طاولة لديك، وما الذي تستخدمه اليوم، وما الذي لا يعمل كما يجب…',
    submit: 'إرسال الرسالة',
    sending: 'جارٍ الإرسال…',
    successTitle: 'وصلتنا رسالتك',
    successBody: 'شكراً لك. سنعاود التواصل معك على الرقم الذي زوّدتنا به.',
    errorTitle: 'لم تُرسل الرسالة',
    errorBody: 'تأكد من الحقول وحاول مرة أخرى.',
    tooMany: 'هذا عدد كبير من الرسائل من مكان واحد. حاول بعد قليل.',
    privacy: 'نستخدم هذه البيانات للرد عليك فقط، ولا تُشارك مع أحد.',
  },
  footer: {
    tagline: 'قرّب جوالك — القائمة تجيك على طاولتك.',
    rights: 'جميع الحقوق محفوظة.',
    staff: 'دخول الموظفين',
    myOrders: 'طلباتي',
  },
}

export function homeCopy(locale: string): HomeCopy {
  return locale === 'ar' ? ar : en
}
