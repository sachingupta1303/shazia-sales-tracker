from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.platypus.flowables import Flowable

OUTPUT = r"C:\Users\hp\rice-export-tracker\ShaziaRice_Website_Gap_Analysis_Report.pdf"

# ── Colours ──────────────────────────────────────────────────────────────────
NAVY   = colors.HexColor("#1B3A6B")
GOLD   = colors.HexColor("#C9A84C")
LGRAY  = colors.HexColor("#F5F7FA")
LBLUE  = colors.HexColor("#EBF2FA")
RED    = colors.HexColor("#C0392B")
GREEN  = colors.HexColor("#1E8449")
WHITE  = colors.white
BLACK  = colors.black

W, H = A4

# ── Styles ────────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

def style(name, **kw):
    s = ParagraphStyle(name, **kw)
    return s

S_cover_conf  = style("CoverConf",  fontName="Helvetica-Bold", fontSize=9,  textColor=GOLD,  alignment=TA_CENTER, spaceAfter=4)
S_cover_co    = style("CoverCo",    fontName="Helvetica-Bold", fontSize=28, textColor=NAVY,  alignment=TA_CENTER, spaceAfter=6)
S_cover_title = style("CoverTitle", fontName="Helvetica-Bold", fontSize=20, textColor=NAVY,  alignment=TA_CENTER, spaceAfter=6)
S_cover_sub   = style("CoverSub",   fontName="Helvetica",      fontSize=13, textColor=NAVY,  alignment=TA_CENTER, spaceAfter=20)
S_cover_meta  = style("CoverMeta",  fontName="Helvetica",      fontSize=10, textColor=NAVY,  alignment=TA_CENTER, leading=18)

S_h1   = style("H1",   fontName="Helvetica-Bold", fontSize=14, textColor=NAVY,  spaceBefore=14, spaceAfter=6,  leading=18)
S_h2   = style("H2",   fontName="Helvetica-Bold", fontSize=11, textColor=NAVY,  spaceBefore=10, spaceAfter=4,  leading=15)
S_gap  = style("GAP",  fontName="Helvetica-Bold", fontSize=12, textColor=WHITE, spaceBefore=12, spaceAfter=6,  leading=16)
S_body = style("BODY", fontName="Helvetica",      fontSize=9.5,textColor=BLACK, spaceBefore=3,  spaceAfter=3,  leading=14, alignment=TA_JUSTIFY)
S_bul  = style("BUL",  fontName="Helvetica",      fontSize=9.5,textColor=BLACK, spaceBefore=2,  spaceAfter=2,  leading=14, leftIndent=14, bulletIndent=4)
S_sub  = style("SUB",  fontName="Helvetica-Bold", fontSize=9.5,textColor=NAVY,  spaceBefore=6,  spaceAfter=2,  leading=13)
S_toc  = style("TOC",  fontName="Helvetica",      fontSize=10, textColor=NAVY,  spaceBefore=4,  spaceAfter=4,  leading=15, leftIndent=12)
S_foot = style("FOOT", fontName="Helvetica",      fontSize=7.5,textColor=colors.HexColor("#888888"), alignment=TA_CENTER)

# ── Header / Footer canvas callback ──────────────────────────────────────────
def on_page(canvas, doc):
    canvas.saveState()
    # footer line
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(0.8)
    canvas.line(2*cm, 1.6*cm, W-2*cm, 1.6*cm)
    # footer text
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(colors.HexColor("#888888"))
    canvas.drawCentredString(W/2, 1.2*cm, "Shazia Rice  —  Confidential Report  —  May 2026  |  www.shaziarice.com")
    # page number
    canvas.drawCentredString(W/2, 0.8*cm, f"Page {doc.page}")
    canvas.restoreState()

def on_cover(canvas, doc):
    canvas.saveState()
    # Full navy background block top
    canvas.setFillColor(NAVY)
    canvas.rect(0, H-3.5*cm, W, 3.5*cm, fill=1, stroke=0)
    # Gold accent stripe
    canvas.setFillColor(GOLD)
    canvas.rect(0, H-3.7*cm, W, 0.22*cm, fill=1, stroke=0)
    # Bottom navy block
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, W, 2.8*cm, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, 2.8*cm, W, 0.18*cm, fill=1, stroke=0)
    # Footer text on cover
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(WHITE)
    canvas.drawCentredString(W/2, 1.1*cm, "Shazia Rice  —  Confidential Report  —  May 2026  |  www.shaziarice.com")
    canvas.restoreState()

# ── Helper flowables ──────────────────────────────────────────────────────────
def hr(color=GOLD, thickness=1.0, spB=4, spA=6):
    return HRFlowable(width="100%", thickness=thickness, color=color, spaceBefore=spB, spaceAfter=spA)

def gap_banner(num, title):
    data = [[Paragraph(f"GAP {num}:  {title}", S_gap)]]
    t = Table(data, colWidths=[16.5*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), NAVY),
        ("LEFTPADDING", (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("ROUNDEDCORNERS", [4]),
    ]))
    return t

def sub(text):
    return Paragraph(text, S_sub)

def body(text):
    return Paragraph(text, S_body)

def bullet(text):
    return Paragraph(f"<bullet>&bull;</bullet> {text}", S_bul)

def sp(h=6):
    return Spacer(1, h)

# ── Build story ───────────────────────────────────────────────────────────────
story = []

# ═══════════════════════════════════════════════════════════════
# COVER PAGE
# ═══════════════════════════════════════════════════════════════
story.append(Spacer(1, 3.8*cm))
story.append(Paragraph("C O N F I D E N T I A L", S_cover_conf))
story.append(Spacer(1, 0.3*cm))
story.append(hr(GOLD, 2, 0, 8))
story.append(Paragraph("SHAZIA RICE", S_cover_co))
story.append(Spacer(1, 0.4*cm))
story.append(Paragraph("Website Gap Analysis Report", S_cover_title))
story.append(Spacer(1, 0.2*cm))
story.append(Paragraph("ShaziaRice.com vs. Top Industry Competitors", S_cover_sub))
story.append(hr(GOLD, 1.5, 0, 16))
story.append(Spacer(1, 0.5*cm))
story.append(Paragraph(
    "<b>Prepared For:</b>  Company Director<br/>"
    "<b>Prepared By:</b>  Digital Strategy Team<br/>"
    "<b>Date:</b>  May 14, 2026<br/>"
    "<b>Classification:</b>  Confidential",
    S_cover_meta))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# EXECUTIVE SUMMARY + TOC
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph("Executive Summary", S_h1))
story.append(hr(GOLD, 1, 0, 6))
story.append(body(
    "A comprehensive benchmarking audit of <b>ShaziaRice.com</b> was conducted and compared against "
    "leading rice export and FMCG companies, including <b>LT Foods</b> (Daawat brand — Rs. 8,770 Cr revenue, "
    "80+ countries) and <b>KRBL Limited</b> (India Gate brand — Rs. 5,000+ Cr revenue, 90+ countries, "
    "130 years of industry experience). "
    "The audit reveals that while ShaziaRice.com has a functional consumer-facing presence with "
    "multiple brands and recipe content, it critically lacks the credibility infrastructure, B2B export "
    "tools, and trust signals required to compete at an international level. "
    "This report identifies <b>10 critical gaps</b> with detailed recommendations and a phased priority "
    "action plan for immediate implementation."
))
story.append(sp(14))

story.append(Paragraph("Table of Contents", S_h2))
story.append(hr(colors.HexColor("#CCCCCC"), 0.5, 0, 4))
toc_items = [
    ("1", "Current Strengths of ShaziaRice.com"),
    ("2", "Critical Gaps — Detailed Point-by-Point Analysis (Gaps 1–10)"),
    ("3", "Competitive Benchmark Summary Table"),
    ("4", "Priority Action Plan"),
    ("5", "Conclusion"),
]
for num, title in toc_items:
    story.append(Paragraph(f"<b>Section {num}</b>  —  {title}", S_toc))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# SECTION 1 — STRENGTHS
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph("Section 1: Current Strengths of ShaziaRice.com", S_h1))
story.append(hr(GOLD, 1, 0, 6))
story.append(body("The following positive elements were identified during the website audit and should be retained and built upon as the site is enhanced."))
story.append(sp(6))

strengths = [
    ("<b>Multiple Brand Portfolio:</b> Shazia, Zaara, and Shireen brands are featured — a strong foundation for market segmentation across buyer types and geographies."),
    ("<b>Recipe &amp; Lifestyle Content:</b> The 'Let's Cook' section provides consumer engagement and meaningful SEO value for food-related search traffic."),
    ("<b>Geographic Reach Display:</b> 21-country flag display on the homepage demonstrates international presence and distribution breadth."),
    ("<b>Customer Testimonials:</b> Two named 5-star reviews (Abhinav Saxena, Riya Malhotra) provide basic social proof of product quality."),
    ("<b>Social Media Integration:</b> Facebook, Instagram, Twitter, and YouTube are all linked — a good starting point for digital marketing."),
    ("<b>Product Range Coverage:</b> Both Basmati (Traditional, Brown, 1121) and Non-Basmati (IR-64, PR-106, PR-11) varieties are listed, covering the key market segments."),
    ("<b>Blog Section:</b> 'From Around the World' culinary articles provide lifestyle content that supports organic search discovery."),
]
for s in strengths:
    story.append(bullet(s))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# SECTION 2 — GAPS
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph("Section 2: Critical Gaps — Detailed Point-by-Point Analysis", S_h1))
story.append(hr(GOLD, 1, 0, 6))
story.append(body("The following 10 critical gaps were identified through direct comparison with industry-leading competitors. Each gap includes current status, competitor benchmarks, business impact, and actionable recommendations."))
story.append(sp(10))

# ── GAP 1 ──
gap_data = [
    (
        "1", "NO TRUST STATISTICS OR COMPANY NUMBERS ON HOMEPAGE",
        "Current Status",
        "The homepage displays no quantified business metrics whatsoever. The 21-country reach is shown only through small flag icons — no text figures appear anywhere on the page.",
        "What Competitors Do",
        [
            "<b>KRBL (India Gate):</b> '#1 Largest Exporter of Branded Basmati Rice from India', '130 Years of Rich Industry Experience', '90+ Countries', 'Revenue Rs. 5,000+ Crore'",
            "<b>LT Foods (Daawat):</b> '70+ Years', '80+ Countries', '4,000+ Employees', 'Revenue Rs. 8,770 Crore FY25', 'Billion-Dollar Global FMCG Company'",
        ],
        "Business Impact",
        "International buyers make trust judgments within 5 seconds of visiting a website. Without visible credibility numbers, potential buyers immediately question the company's scale and move to a competitor who clearly displays this information.",
        "Recommendation",
        "Add a prominent statistics bar on the homepage. Example: '25+ Years of Excellence | 21+ Countries | 3 Power Brands | 50,000 MT Annual Export Capacity' (use your actual figures). This single change dramatically improves first impressions at zero cost.",
    ),
]

gaps = [
    (
        "1", "NO TRUST STATISTICS OR COMPANY NUMBERS ON HOMEPAGE",
        "Current Status:",
        "The homepage displays no quantified business metrics. The 21-country reach is shown only through small flag icons — no text figures appear anywhere on the page.",
        "What Competitors Do:",
        [
            "<b>KRBL (India Gate):</b> '#1 Largest Exporter of Branded Basmati Rice', '130 Years of Experience', '90+ Countries', 'Revenue Rs. 5,000+ Crore'",
            "<b>LT Foods (Daawat):</b> '70+ Years', '80+ Countries', '4,000+ Employees', 'Revenue Rs. 8,770 Crore FY25'",
        ],
        "Business Impact:",
        "International buyers make trust judgments within 5 seconds. Without visible credibility numbers, potential buyers immediately question company scale and move on to a competitor.",
        "Recommendation:",
        ["Add a statistics bar on the homepage: '25+ Years | 21+ Countries | 3 Brands | 50,000 MT Annual Export'. Use your actual figures. This single change costs nothing and dramatically improves first impressions for international buyers."],
    ),
    (
        "2", "NO CERTIFICATIONS OR QUALITY BADGES DISPLAYED",
        "Current Status:",
        "No certifications, quality standards, or regulatory approvals are visible anywhere on the homepage, product pages, or footer.",
        "What Competitors Do:",
        [
            "Top exporters prominently display: FSSAI License, ISO 22000, HACCP, Halal Certification, Kosher Certification, APEDA Registration, Organic Certifications, and EU/FDA compliance badges.",
        ],
        "Business Impact:",
        "Food safety certifications are the #1 trust signal for international B2B buyers. Middle East importers require Halal. European buyers require ISO 22000/HACCP. US buyers expect FDA compliance. Without certifications, many importers will not even initiate contact.",
        "Recommendation:",
        [
            "Create a 'Quality & Certifications' section on the homepage with badge images",
            "Link each badge to a downloadable certificate PDF",
            "This is non-negotiable for international trade credibility",
        ],
    ),
    (
        "3", "NO B2B EXPORT INQUIRY SYSTEM",
        "Current Status:",
        "The only contact mechanism is a generic 'Contact Us' link in the footer. No phone number or email is visible on the homepage. No export-specific inquiry form exists.",
        "What Competitors Do:",
        [
            "<b>LT Foods:</b> Separate emails for investor relations, customer care, and business/sales. Phone number in header.",
            "<b>KRBL:</b> Phone numbers and full office addresses visible across the site. Customer care email prominently displayed.",
        ],
        "Business Impact:",
        "For a B2B export business, inability to quickly reach the company is a direct conversion killer. A buyer in Dubai or London who cannot find a phone number within 10 seconds will move to a competitor.",
        "Recommendation:",
        [
            "Place phone number and email in the website header (visible on every page)",
            "Add a prominent 'Get Export Quote' button in the homepage hero section",
            "Create an Export Inquiry Form: Product Type, Grade, Quantity (MT), Packaging, Destination Country, Delivery Timeline, Buyer Company Name",
            "Add a WhatsApp Business floating chat button — standard in the rice export industry",
        ],
    ),
    (
        "4", "NO COMPANY LEADERSHIP OR FOUNDER STORY",
        "Current Status:",
        "An About Us section exists but no leadership team profiles, founder story, director biography, or company heritage timeline is visible.",
        "What Competitors Do:",
        [
            "<b>LT Foods:</b> Full leadership team page with director photos, names, and designations.",
            "<b>KRBL:</b> Company heritage narrative from 1889, detailed founder story, full management profiles.",
        ],
        "Business Impact:",
        "International buyers — especially from the Middle East, Europe, and the Americas — want to know WHO they are doing business with before committing to trade relationships worth crores. Anonymous companies are high-risk in the eyes of importers.",
        "Recommendation:",
        [
            "Add a 'Leadership' page with Company Director profile, professional photo, and personal message",
            "Include key management team members with photos and designations",
            "Add a company founding story and milestone timeline",
            "Include a Director's message about export vision and quality commitment",
        ],
    ),
    (
        "5", "NO CSR / SUSTAINABILITY / ESG SECTION",
        "Current Status:",
        "No mention of corporate social responsibility, sustainability practices, farmer partnerships, or environmental initiatives anywhere on the website.",
        "What Competitors Do:",
        [
            "<b>LT Foods:</b> Full ESG framework covering water conservation, farmer livelihood support, agriculture development, health, and education.",
            "<b>KRBL:</b> 'Climate Positive Award 2022', dedicated CSR and Sustainability sections with documented initiatives.",
        ],
        "Business Impact:",
        "ESG disclosure is now legally required for suppliers to many European retailers. UK and EU import regulations increasingly demand supplier sustainability documentation. Without this section, Shazia Rice is effectively excluded from a growing premium segment of international buyers.",
        "Recommendation:",
        [
            "Create a CSR/Sustainability page covering farmer partnership programs",
            "Document water conservation in the milling process",
            "Highlight eco-friendly and recyclable packaging initiatives",
            "Mention community development work and environmental targets",
        ],
    ),
    (
        "6", "WEAK AND INCOMPLETE PRODUCT PAGES",
        "Current Status:",
        "Products are listed by name with basic images and 'View All' navigation. No detailed technical specifications are provided for any variety.",
        "What Top Exporters Provide:",
        [
            "Grain length in mm (before and after cooking)",
            "Aging period (e.g., 'Aged 2 years for superior aroma')",
            "Aroma profile, moisture content, and available grades",
            "Packaging sizes: 1kg, 5kg, 25kg, 50kg sacks",
            "Minimum Order Quantity (MOQ) for export orders",
            "Certifications applicable to each product",
            "Shelf life and cooking instructions",
        ],
        "Business Impact:",
        "Serious international rice buyers are technical buyers. They compare grain specifications, not just brand names. Incomplete product pages signal an amateur operation and prevent buyers from self-qualifying, meaning direct loss of sales.",
        "Recommendation:",
        [
            "Rebuild each product page as a full technical specification sheet",
            "Add downloadable product datasheets (PDF) for each variety",
            "This is a high-value feature that serious B2B importers strongly prefer",
        ],
    ),
    (
        "7", "NO VIDEO CONTENT",
        "Current Status:",
        "The website relies entirely on static photography. No video content of any kind was found on the homepage or any other section.",
        "What Competitors Do:",
        [
            "<b>LT Foods:</b> Extensive brand campaign videos, factory tour footage, cooking demonstrations, and corporate culture videos.",
            "<b>KRBL:</b> Media section with video press releases, news coverage, and brand campaign content.",
        ],
        "Business Impact:",
        "Video is the highest-engagement content format on the web. Factory videos serve a critical trust function — they prove to international buyers that a real, large-scale milling and processing facility exists behind the brand.",
        "Recommendation:",
        [
            "Priority 1: Factory/milling facility tour video (60–120 seconds) — most important for B2B trust",
            "Priority 2: Brand story video — who is Shazia Rice, our journey, our values (90 seconds)",
            "Priority 3: Product quality video — grain selection, processing, packaging",
            "Embed prominently on the homepage, not buried in a media gallery",
        ],
    ),
    (
        "8", "NO AWARDS, RECOGNITION, OR MEDIA SECTION",
        "Current Status:",
        "No awards, industry recognition, trade fair participation, press coverage, or media mentions are displayed anywhere on the website.",
        "What Competitors Do:",
        [
            "<b>LT Foods:</b> Great Place to Work 2025, SKOCH ESG Award 2024, Guinness World Record 2023",
            "<b>KRBL:</b> LACP Gold Award 2025, Climate Positive Award 2022, 15+ press releases published",
        ],
        "Business Impact:",
        "Awards and media coverage provide third-party validation — the most powerful form of credibility because it originates outside the company. Their complete absence makes Shazia Rice appear as a company that has never been recognised by the industry.",
        "Recommendation:",
        [
            "Display any trade awards, export excellence awards, or APEDA recognitions received",
            "List international trade fairs attended (Gulfood, Anuga, SIAL) — participation alone builds credibility",
            "Add a press/media page with any newspaper or magazine coverage",
            "If no awards exist yet: Apply for APEDA's 'Star Export House' status immediately",
        ],
    ),
    (
        "9", "NO CAREERS PAGE",
        "Current Status:",
        "No careers or employment section exists anywhere on the website.",
        "Why This Matters:",
        [
            "A careers page signals company scale and growth to international partners and distributors.",
            "Buyers use the presence of an active careers page to assess whether a company is a serious enterprise or a small trading operation.",
            "It is also a talent acquisition tool as the company scales internationally.",
        ],
        "Business Impact:",
        "Without a careers page, the company appears smaller and less established than it may actually be — a negative perception that affects buyer confidence.",
        "Recommendation:",
        [
            "Add a Careers page with 2–3 current or aspirational role listings",
            "Include a Director's message on company culture and growth vision",
            "This single page significantly elevates perceived company professionalism",
        ],
    ),
    (
        "10", "TECHNICAL AND LEGAL DEFICIENCIES",
        "Issues Identified:",
        "",
        "Detail:",
        [
            "<b>No Privacy Policy Page:</b> Violates GDPR (EU) and India's DPDP Act 2023. European buyers may refuse to engage with non-compliant suppliers. Fix: Publish and link a Privacy Policy immediately.",
            "<b>No Search Functionality:</b> Poor UX for buyers seeking specific product varieties or technical information. Fix: Add a search bar in the header.",
            "<b>No XML Sitemap:</b> Reduces Google indexing and lowers search rankings, meaning fewer organic buyer inquiries. Fix: Submit sitemap to Google Search Console.",
            "<b>Static/Undated Blog:</b> Search engines deprioritise inactive sites. Stale content signals an inactive company. Fix: Publish minimum 2 posts per month.",
            "<b>No Email Capture:</b> Missed opportunity to build a buyer and distributor database. Fix: Add newsletter signup offering a free product catalogue.",
        ],
        "Business Impact:",
        "These issues collectively reduce search visibility, block legal market access (EU), and limit the company's ability to build a direct marketing database of potential buyers.",
        "Recommendation:",
        ["Treat the Privacy Policy as urgent legal compliance. Address all other technical issues within 2–4 weeks as part of a site-wide improvement sprint."],
    ),
]

for g in gaps:
    num, title, s1_label, s1_text, s2_label, s2_bullets, s3_label, s3_text, s4_label, s4_items = g
    story.append(KeepTogether([gap_banner(num, title), sp(6)]))
    if s1_text:
        story.append(sub(s1_label))
        story.append(body(s1_text))
    story.append(sub(s2_label))
    for b_text in s2_bullets:
        story.append(bullet(b_text))
    story.append(sub(s3_label))
    story.append(body(s3_text))
    story.append(sub(s4_label))
    if isinstance(s4_items, list):
        for item in s4_items:
            story.append(bullet(item))
    else:
        story.append(body(s4_items))
    story.append(sp(10))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# SECTION 3 — BENCHMARK TABLE
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph("Section 3: Competitive Benchmark Summary", S_h1))
story.append(hr(GOLD, 1, 0, 6))
story.append(body("The table below provides a side-by-side feature comparison of ShaziaRice.com against the two benchmark competitors analysed in this report."))
story.append(sp(10))

def cell(text, bold=False, color=BLACK, bg=None):
    s = ParagraphStyle("tc", fontName="Helvetica-Bold" if bold else "Helvetica",
                       fontSize=8.5, textColor=color, leading=12,
                       alignment=TA_CENTER, spaceBefore=2, spaceAfter=2)
    return Paragraph(text, s)

def missing(): return cell("MISSING", True, RED)
def present(): return cell("Present", False, GREEN)
def full():    return cell("Full Section", False, GREEN)
def extensive():return cell("Extensive", False, GREEN)
def partial(): return cell("Partial", False, colors.HexColor("#B7770D"))

hdr = [
    cell("Feature", True, WHITE),
    cell("ShaziaRice.com", True, WHITE),
    cell("LT Foods\n(Daawat)", True, WHITE),
    cell("KRBL\n(India Gate)", True, WHITE),
]

rows = [
    ["Homepage Trust Statistics",    missing(), present(), present()],
    ["Certifications Display",       missing(), present(), present()],
    ["Phone / Email in Header",      missing(), present(), present()],
    ["Export Inquiry Form",          missing(), present(), present()],
    ["Leadership / Team Page",       missing(), present(), present()],
    ["CSR / Sustainability Section", missing(), full(),    full()],
    ["Detailed Product Specs",       missing(), present(), present()],
    ["Video Content",                missing(), extensive(),present()],
    ["Awards / Recognition",         missing(), present(), present()],
    ["Careers Page",                 missing(), present(), present()],
    ["Privacy Policy Page",          missing(), present(), present()],
    ["WhatsApp / Live Chat",         missing(), present(), partial()],
    ["Active Blog / News",           partial(), present(), present()],
    ["Social Media Links",           present(), present(), present()],
    ["Multiple Brand Portfolio",     present(), present(), present()],
    ["Recipe / Lifestyle Content",   present(), present(), partial()],
]

feat_style = ParagraphStyle("feat", fontName="Helvetica", fontSize=8.5,
                             textColor=BLACK, leading=12, spaceBefore=2, spaceAfter=2)
table_data = [hdr]
for i, row in enumerate(rows):
    feat_p = Paragraph(row[0], feat_style)
    table_data.append([feat_p, row[1], row[2], row[3]])

col_w = [6.2*cm, 3.4*cm, 3.4*cm, 3.4*cm]
t = Table(table_data, colWidths=col_w, repeatRows=1)

ts = TableStyle([
    ("BACKGROUND",   (0,0), (-1,0),  NAVY),
    ("TEXTCOLOR",    (0,0), (-1,0),  WHITE),
    ("FONTNAME",     (0,0), (-1,0),  "Helvetica-Bold"),
    ("ALIGN",        (0,0), (-1,-1), "CENTER"),
    ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
    ("ROWBACKGROUNDS",(0,1),(-1,-1), [WHITE, LBLUE]),
    ("GRID",         (0,0), (-1,-1), 0.4, colors.HexColor("#CCCCCC")),
    ("TOPPADDING",   (0,0), (-1,-1), 5),
    ("BOTTOMPADDING",(0,0), (-1,-1), 5),
])
t.setStyle(ts)
story.append(t)
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# SECTION 4 — ACTION PLAN
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph("Section 4: Priority Action Plan", S_h1))
story.append(hr(GOLD, 1, 0, 6))
story.append(body("The following phased plan prioritises actions by urgency and business impact. Immediate actions require no development cost and can be completed within days."))
story.append(sp(10))

phases = [
    (NAVY, "PRIORITY 1 — IMMEDIATE ACTION  (Within 2 Weeks)", [
        "Add phone number and email address to website header on all pages",
        "Publish a Privacy Policy page — legal compliance, urgent",
        "Add 'Get Export Quote' call-to-action button in the homepage hero section",
        "Display certifications on the homepage (FSSAI, Halal, ISO 22000, APEDA)",
    ]),
    (colors.HexColor("#1A5276"), "PRIORITY 2 — SHORT TERM  (Within 1 Month)", [
        "Add trust statistics bar to homepage (years in business, countries, export volume)",
        "Rebuild product pages with full technical specifications per variety",
        "Add WhatsApp Business floating chat button",
        "Create a dedicated Export Inquiry Form with all relevant B2B fields",
    ]),
    (colors.HexColor("#1F618D"), "PRIORITY 3 — MEDIUM TERM  (Within 3 Months)", [
        "Produce and publish a factory tour video for the homepage",
        "Create Leadership / About Us page with Director profile and photo",
        "Create CSR / Sustainability page documenting responsible practices",
        "Add an Awards and Media Coverage section",
        "Add a Careers page with current or aspirational roles",
        "Launch regular blog publishing schedule (minimum 2 posts per month)",
    ]),
    (colors.HexColor("#2E86C1"), "PRIORITY 4 — LONG TERM  (3 to 6 Months)", [
        "Apply for APEDA Star Export House certification",
        "Apply for EEPC and APEDA Export Awards",
        "Participate in at least one international trade fair (Gulfood, Anuga, SIAL) and document it on the website",
        "Develop a downloadable B2B product catalogue (PDF) for international buyers",
        "Add an Investor Relations section as the business scales",
    ]),
]

for bg, phase_title, items in phases:
    # Phase header
    ph_style = ParagraphStyle("ph", fontName="Helvetica-Bold", fontSize=10,
                               textColor=WHITE, leading=14)
    ph_data = [[Paragraph(phase_title, ph_style)]]
    ph_t = Table(ph_data, colWidths=[16.5*cm])
    ph_t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), bg),
        ("LEFTPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    story.append(ph_t)
    for item in items:
        story.append(bullet(item))
    story.append(sp(8))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# SECTION 5 — CONCLUSION
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph("Section 5: Conclusion", S_h1))
story.append(hr(GOLD, 1, 0, 6))
story.append(body(
    "ShaziaRice.com currently functions as a basic consumer brand showcase. However, as a rice export "
    "business competing in international markets, the website must operate as a full business development "
    "platform — one that builds trust, generates qualified export leads, demonstrates operational scale, "
    "and meets legal requirements across multiple jurisdictions."
))
story.append(sp(8))
story.append(body(
    "The <b>10 gaps identified in this report are not cosmetic issues.</b> They directly and materially "
    "affect the company's ability to attract international buyers, win distributors, and compete for "
    "export contracts. Companies like KRBL and LT Foods have built billion-dollar export businesses "
    "partly on the strength of their digital credibility infrastructure — infrastructure that "
    "ShaziaRice.com currently lacks entirely."
))
story.append(sp(8))
story.append(body(
    "By implementing the recommendations in this report in order of priority, ShaziaRice.com can be "
    "transformed into a world-class export business website within <b>3 to 6 months</b> — one capable "
    "of competing for international buyers at the highest level, in any market."
))
story.append(sp(12))

# Closing box
closing_style = ParagraphStyle("cl", fontName="Helvetica-Bold", fontSize=10,
                                textColor=NAVY, alignment=TA_CENTER, leading=16)
cl_data = [[Paragraph(
    "The investment required is modest.<br/>"
    "The competitive advantage gained is substantial.<br/>"
    "The cost of inaction — in lost buyer inquiries and missed export contracts — is significant and ongoing.",
    closing_style
)]]
cl_t = Table(cl_data, colWidths=[16.5*cm])
cl_t.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), LBLUE),
    ("BOX", (0,0), (-1,-1), 1.5, GOLD),
    ("LEFTPADDING", (0,0), (-1,-1), 16),
    ("RIGHTPADDING", (0,0), (-1,-1), 16),
    ("TOPPADDING", (0,0), (-1,-1), 14),
    ("BOTTOMPADDING", (0,0), (-1,-1), 14),
]))
story.append(cl_t)
story.append(sp(16))
story.append(body("<i>This report has been prepared for the Director's review and approval to proceed with implementation.</i>"))

# ═══════════════════════════════════════════════════════════════
# BUILD
# ═══════════════════════════════════════════════════════════════
doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    leftMargin=2.2*cm, rightMargin=2.2*cm,
    topMargin=2.5*cm, bottomMargin=2.8*cm,
    title="Website Gap Analysis Report — ShaziaRice.com",
    author="Digital Strategy Team",
    subject="Confidential Website Audit",
)

doc.build(story, onFirstPage=on_cover, onLaterPages=on_page)
print(f"PDF created: {OUTPUT}")
