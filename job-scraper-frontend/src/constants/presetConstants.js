// One-click filter presets. Applied on top of the current form: only the
// listed fields change.

const split = (text) => text.split(',').map((s) => s.trim()).filter(Boolean);

export const PRESETS = [
    {
        id: 'senior-leadership',
        label: 'Senior leadership (retained search)',
        hint: 'Director, VP and C-level roles only (no "head of"). Whole-word matching on the job title, the usual title traps excluded (assistant to, art director, principal engineer, HR business partner…), VP titles at banks dropped, salary floor 150,000 with unknown pay kept.',
        apply: {
            filterKeywords: split(
                'chief, chief executive officer, chief executive, chief financial officer, chief operating officer, chief operations officer, ' +
                'chief technology officer, chief technical officer, chief information officer, chief marketing officer, chief revenue officer, ' +
                'chief commercial officer, chief sales officer, chief growth officer, chief customer officer, chief product officer, ' +
                'chief people officer, chief human resources officer, chief talent officer, chief legal officer, chief compliance officer, ' +
                'chief risk officer, chief strategy officer, chief security officer, chief information security officer, chief data officer, ' +
                'chief digital officer, chief transformation officer, chief supply chain officer, chief procurement officer, chief medical officer, ' +
                'chief scientific officer, chief administrative officer, chief accounting officer, chief investment officer, chief experience officer, ' +
                'chief communications officer, chief sustainability officer, chief innovation officer, ' +
                'ceo, cfo, coo, cto, cio, cmo, cro, cco, cso, cgo, cpo, chro, clo, ciso, cdo, cao, cxo, ' +
                'president, executive vice president, senior vice president, group vice president, vice president, evp, svp, vp, v.p., ' +
                'managing director, executive director, senior director, sr director, sr. director, group director, regional director, ' +
                'global director, area director, division director, director, ' +
                'general manager, gm, country manager, managing partner, partner, principal, general counsel, deputy general counsel, ' +
                'controller, board member, non-executive director, founder in residence'
            ),
            filterMatchIn: ['title'],
            excludeWords: split(
                'assistant to, executive assistant, administrative assistant, assistant, associate, coordinator, specialist, analyst, intern, internship, ' +
                'trainee, apprentice, junior, jr, entry level, graduate, clerk, representative, rep, technician, receptionist, secretary, office manager, ' +
                'art director, creative director, funeral director, activities director, camp director, music director, athletic director, casting director, ' +
                'daycare director, childcare director, director of first impressions, assistant director, associate director, deputy director, store director, ' +
                'restaurant general manager, assistant general manager, hotel general manager, store manager, shift, crew, ' +
                'chief engineer, chief resident, chief petty officer, vice principal, school principal, ' +
                'principal engineer, principal developer, principal designer, principal consultant, principal scientist, principal architect, principal software engineer, ' +
                'partner manager, partner success, channel partner, business partner, hr business partner, hrbp, sales partner, delivery partner, founding engineer, ' +
                'medical director, program director, ' +
                'avp, assistant vice president, air traffic controller, document controller, quality controller, ' +
                'part time, part-time, contract, contractor, temporary, temp, freelance, commission only, 1099, hourly, seasonal, volunteer, unpaid'
            ),
            excludeMatchIn: ['title'],
            wholeWordMatch: true,
            dropBankVps: true,
            seniorityLevels: ['Director', 'Executive'],
            employmentTypes: ['Full-time'],
            salaryMin: 150000,
            salaryMax: '',
            includeNoSalary: true,
        },
    },
];
