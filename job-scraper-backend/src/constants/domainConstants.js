export const SCRAPINGDOG_GOOGLE_URL = 'https://api.scrapingdog.com/google';

// A failed lookup ("no domain found") is retried after this long.
export const DOMAIN_LOOKUP_RETRY_DAYS = 90;

export const DOMAIN_LOOKUP_TIMEOUT_MS = 30_000;
export const DOMAIN_LOOKUP_RESULTS = 10;

export const DOMAIN_SOURCE = {
    BOARD: 'board',        // came from the job board as-is
    FOUND: 'found',        // looked up via Google (ScrapingDog)
    BOARD_UNVERIFIED: 'board-unverified', // board gave a domain that does not resemble the name and Google found nothing better
    MEMORY: 'memory',      // a lookup we did earlier
    NONE: 'none',          // nothing usable
};

// Domains that are never a company's own site. Matched on the registrable
// domain and any subdomain of it.
export const BAD_DOMAINS = [
    // link shorteners / link pages
    'bit.ly', 'bitly.com', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'buff.ly', 'lnkd.in', 'rebrand.ly',
    'cutt.ly', 'is.gd', 'shorturl.at', 'tiny.cc', 'linktr.ee', 'linktree.com', 'beacons.ai', 'lnk.bio',
    'bio.link', 'carrd.co', 'about.me', 'hubs.ly', 'hubs.la', 'smarturl.it', 'qrco.de',
    // social
    'linkedin.com', 'facebook.com', 'fb.com', 'instagram.com', 'twitter.com', 'x.com', 'youtube.com',
    'youtu.be', 'tiktok.com', 'pinterest.com', 'threads.net', 'snapchat.com', 'reddit.com', 'medium.com',
    'wa.me', 'whatsapp.com', 't.me', 'telegram.me', 'discord.gg', 'discord.com',
    // job boards / ATS / marketplaces
    'indeed.com', 'glassdoor.com', 'ziprecruiter.com', 'monster.com', 'careerbuilder.com', 'dice.com',
    'simplyhired.com', 'lever.co', 'greenhouse.io', 'workday.com', 'myworkdayjobs.com', 'jobvite.com',
    'icims.com', 'smartrecruiters.com', 'bamboohr.com', 'breezy.hr', 'workable.com', 'applytojob.com',
    'recruitee.com', 'ashbyhq.com', 'rippling.com', 'paylocity.com', 'paycomonline.net', 'adp.com',
    'ultipro.com', 'taleo.net', 'successfactors.com', 'jazz.co', 'jazzhr.com', 'wellfound.com', 'angel.co',
    'upwork.com', 'fiverr.com', 'freelancer.com', 'toptal.com', 'craigslist.org', 'jobs2careers.com',
    'talent.com', 'jooble.org', 'lensa.com', 'adzuna.com', 'neuvoo.com', 'snagajob.com', 'careerjet.com',
    // email / generic
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'protonmail.com',
    'google.com', 'apple.com', 'microsoft.com', 'amazon.com', 'wikipedia.org', 'wordpress.com',
    'blogspot.com', 'wix.com', 'wixsite.com', 'squarespace.com', 'weebly.com', 'godaddysites.com',
    'sites.google.com', 'docs.google.com', 'forms.gle', 'notion.site', 'notion.so', 'calendly.com',
    'mailchimp.com', 'eventbrite.com', 'meetup.com', 'yelp.com', 'bbb.org', 'crunchbase.com',
    'zoominfo.com', 'dnb.com', 'manta.com', 'mapquest.com', 'maps.app.goo.gl',
    // SSO / login hosts, directories, data vendors, news
    'okta.com', 'okta-emea.com', 'onelogin.com', 'auth0.com', 'microsoftonline.com', 'sharepoint.com', 'hr.com',
    'bloomberg.com', 'reuters.com', 'sec.gov', 'trustpilot.com', 'g2.com', 'capterra.com', 'owler.com',
    'rocketreach.co', 'signalhire.com', 'apollo.io', 'craft.co', 'pitchbook.com', 'cbinsights.com', 'comparably.com',
    'builtin.com', 'theorg.com', 'opencorporates.com', 'buzzfile.com', 'kununu.com', 'ambitionbox.com',
    'prnewswire.com', 'businesswire.com', 'globenewswire.com', 'forbes.com', 'inc.com', 'fortune.com',
    'example.com', 'localhost',
];

// Words in a company name that say nothing about the domain.
export const NAME_STOPWORDS = [
    'inc', 'llc', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company', 'group', 'holdings',
    'the', 'and', 'of', 'a', 'an', 'plc', 'gmbh', 'ag', 'sa', 'srl', 'bv', 'pty', 'llp', 'lp', 'pc',
    'international', 'global', 'usa', 'us', 'america', 'american', 'services', 'solutions', 'partners',
    'technologies', 'technology', 'systems', 'enterprises', 'industries', 'associates',
];
