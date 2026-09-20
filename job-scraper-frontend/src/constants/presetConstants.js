// One-click filter presets. Applied on top of the current form: only the
// listed fields change.

const split = (text) => text.split(',').map((s) => s.trim()).filter(Boolean);

export const PRESETS = [
    {
        id: 'senior-leadership',
        label: 'Senior leadership (retained search)',
        hint: 'Director, VP and C-level roles only. Whole-word matching on the job title, with the usual title traps excluded (assistant to, art director, principal engineer, HR business partner…).',
        apply: {
            filterKeywords: split(
                'chief, ceo, cfo, coo, cto, cio, cmo, cro, chro, cpo, cso, ciso, cdo, cco, clo, cao, ' +
                'president, vice president, vp, v.p., svp, evp, senior vice president, executive vice president, group vice president, ' +
                'director, managing director, executive director, senior director, sr director, sr. director, group director, regional director, global director, ' +
                'head of, global head, general manager, gm, country manager, managing partner, partner, principal, general counsel, controller, treasurer, ' +
                'board member, non-executive director, founder in residence'
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
                'avp, assistant vice president, air traffic controller, document controller, quality controller, ' +
                'part time, part-time, contract, contractor, temporary, temp, freelance, commission only, 1099, hourly, seasonal, volunteer, unpaid'
            ),
            excludeMatchIn: ['title'],
            wholeWordMatch: true,
            seniorityLevels: ['Director', 'Executive'],
            employmentTypes: ['Full-time'],
        },
    },
];
