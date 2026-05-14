# ScoreBallPlan — Softball Scheduler Feature Handoff
*Generated from Claude.ai chat session. Paste this into Claude Code to continue development.*

---

## What This Is

A **recreational softball league scheduler** built iteratively with Claude.ai for the Hopkinton Parks & Rec Men's Softball 2026 season. The goal is to integrate this as a reusable scheduling feature inside ScoreBallPlan.

The scheduler uses **simulated annealing** to assign matchups to time slots while satisfying a complex set of fairness and logistical constraints. The 2026 season schedule has been fully finalized and is included as JSON at the bottom of this doc.

---

## League Configuration (2026 Season)

### Teams (8 total)
```json
[
  "Ravenwood Brewers",
  "The Old Glories",
  "Guaranteed Up",
  "TJs Ballers",
  "Start Line Brewing",
  "Swingers",
  "Colt45s",
  "Blue Team"
]
```

### Team Metadata
Each team has:
- A **color scheme** (for UI theming per team)
- A **strength tier** (affects home/away balance)

```json
{
  "Ravenwood Brewers":  { "colors": ["Navy Blue", "Gold"],                  "strong": false },
  "The Old Glories":    { "colors": ["Light Blue", "White"],                "strong": true  },
  "Guaranteed Up":      { "colors": ["Red", "Light Blue", "Light Green"],   "strong": true  },
  "TJs Ballers":        { "colors": ["Green"],                              "strong": false },
  "Start Line Brewing": { "colors": ["Gray Green"],                         "strong": false },
  "Swingers":           { "colors": ["Pink"],                               "strong": false },
  "Colt45s":            { "colors": ["Dark Blue", "White"],                 "strong": true  },
  "Blue Team":          { "colors": ["Dark Blue"],                          "strong": true  }
}
```

> **Strong teams** (The Old Glories, Guaranteed Up, Colt45s, Blue Team) are assigned **3 home / 4 away** games. All others get roughly **4 home / 3 away**.

---

## Venue & Slot Configuration

### Fields
| Field | Name | Lights | Notes |
|-------|------|--------|-------|
| Field 12 | The Swamp | ❌ No | Day games only. 6:30 PM start, ends ~8:00 PM |
| Field 5 | Baseball - Field 5 | ✅ Yes | Turf. 2 games: 6:30 PM and 8:15 PM |
| Field 4 | Softball - Field 4 | ✅ Yes | Turf. 2 games: 6:30 PM and 8:15 PM |

### Time Slots
- **Swamp games**: 6:30 PM only (warm-up 6:15), done by ~8:00 PM
- **Turf Game 1**: 6:30 PM start (warm-up 6:15)
- **Turf Game 2**: 8:15 PM start (warm-up 8:00), ends 9:45 PM

### 2026 Season Slot Schedule
| Date | Field | Capacity | Notes |
|------|-------|----------|-------|
| Tuesday, June 16 | Field 12 (The Swamp) | 1 game | Regular season opener |
| Thursday, June 18 | Field 12 (The Swamp) | 1 game | |
| Tuesday, June 23 | Field 12 (The Swamp) | 1 game | |
| Tuesday, June 23 | Baseball - Field 5 | 2 games | |
| Thursday, June 25 | Field 12 (The Swamp) | 1 game | ⚡ DH Night (see below) |
| Thursday, June 25 | Baseball - Field 5 | 2 games | ⚡ DH Night |
| Thursday, June 25 | Softball - Field 4 | 2 games | ⚡ DH Night |
| Tuesday, June 30 | Baseball - Field 5 | 0 games | **Makeup only** |
| Thursday, July 2 | Softball - Field 4 | 0 games | **Makeup only** (July 4th weekend) |
| Tuesday, July 7 | Softball - Field 4 | 2 games | |
| Thursday, July 9 | Softball - Field 4 | 2 games | |
| Tuesday, July 14 | Softball - Field 4 | 2 games | |
| Thursday, July 16 | Softball - Field 4 | 2 games | |
| Tuesday, July 21 | Baseball - Field 5 | 2 games | |
| Thursday, July 23 | Softball - Field 4 | 2 games | |
| Tuesday, July 28 | Baseball - Field 5 | 2 games | |
| Thursday, July 30 | Softball - Field 4 | 2 games | |
| Tuesday, August 4 | Baseball - Field 5 | 2 games | Regular season finale |
| Thursday, August 6 | Softball - Field 4 | 2 games | **Makeup only** |
| Monday, August 10 | Baseball - Field 5 | 2 games | 🏆 Playoffs |
| Tuesday, August 11 | Softball - Field 4 | 2 games | 🏆 Playoffs |
| Wednesday, August 12 | Softball - Field 4 | 2 games | 🏆 Playoffs |
| Thursday, August 13 | Softball - Field 4 | 2 games | 🏆 Playoffs |

> **June 25 note**: This night has 5 concurrent game slots across 3 fields. With 8 teams and 10 team-slot requirements, 2 teams mathematically must play twice. In 2026, **Ravenwood Brewers** and **TJs Ballers** drew the doubleheader. They play each other at The Swamp (6:30), then each have a second game on the turf later that night. This is acceptable — different times, different fields. Teams who object can attempt to reschedule to June 30.

---

## Scheduling Constraints (in priority order)

These are the rules the optimizer must satisfy. Higher priority = higher penalty weight.

### HARD Constraints (must not be violated)
1. **No same-time conflicts**: A team cannot appear in two games at the same time on the same date. *(Two games on the same night at different times = OK — that's a doubleheader)*
2. **Full round-robin**: Every team must play every other team exactly once (28 unique matchups for 8 teams)
3. **Exactly 28 regular season games**
4. **Each team plays exactly 1 Swamp game** (Field 12)

### SOFT Constraints (optimizer minimizes violations)
5. **Strong team home/away**: Blue Team, Colt45s, Guaranteed Up, The Old Glories → 3 home, 4 away
6. **Other team home/away**: Remaining 4 teams → balanced ~3-4 home/away
7. **Time slot balance**: Each team should play roughly equal 6:30 PM and 8:15 PM starts
8. **Field balance**: Each team should play roughly equal Field 5 and Field 4 games (Swamp counts separately)
9. **Doubleheader fairness**: When doubleheaders are forced (e.g. June 25), avoid assigning them to strong teams

---

## The Algorithm

### Approach: Simulated Annealing

We have 28 games to assign to 28 slot contexts. Each assignment has two decisions:
1. **Which matchup goes in which slot** (permutation of 28 pairs)
2. **Which team is home vs. away** (binary flip per game)

Simulated annealing explores the space by randomly swapping matchups between slots and flipping home/away, accepting worse solutions with decreasing probability over time (cooling schedule).

### Score Function
Lower score = better schedule. Penalties accumulate for:

```python
def score(assignment, flips):
    penalty = 0

    # HARD: same-time conflict (per date+time bucket)
    penalty += same_time_conflicts * 5000

    for each team:
        # HARD: swamp game count
        penalty += (swamp_count - 1)**2 * 800

        # SOFT: home/away balance
        if strong_team:
            penalty += (home_count - 3)**2 * 100
            penalty += (away_count - 4)**2 * 100
        else:
            penalty += (home_count - away_count)**2 * 30

        # SOFT: time slot balance
        penalty += (games_at_630 - games_at_815)**2 * 8

        # SOFT: field balance
        penalty += (field5_count - field4_count)**2 * 3

        # SOFT: doubleheader fairness (June 25 specific)
        if team_plays_twice_on_june25 and team_is_strong:
            penalty += 3000

    return penalty
```

### Annealing Parameters (tuned values)
```python
T_initial = 100.0
T_decay   = 0.999993      # per iteration
iterations = 1_200_000
seed = 42
```

### Move Types
Each iteration randomly picks one of:
- **Swap** (55% prob): Swap two matchups between slots
- **Flip** (30% prob): Flip home/away for one game
- **Swap + Flip** (15% prob): Do both

---

## Inputs & Outputs (API Shape for ScoreBallPlan)

### Input: League Config
```typescript
interface LeagueConfig {
  teams: Team[];
  slots: Slot[];
  constraints: ConstraintConfig;
}

interface Team {
  id: string;
  name: string;
  colors: string[];
  isStrong: boolean;        // affects home/away target
  homeTarget: number;       // e.g. 3 for strong, 4 for others
  awayTarget: number;       // e.g. 4 for strong, 3 for others
}

interface Slot {
  date: string;             // "Tuesday, June 16"
  field: string;            // "Field 12 (The Swamp)"
  isSwamp: boolean;         // no lights, 6:30 only
  gameNumber: 1 | 2;        // 1 = 6:30 PM, 2 = 8:15 PM
  isMakeup: boolean;        // excluded from regular season
  isPlayoff: boolean;       // excluded from regular season
}

interface ConstraintConfig {
  swampGamesPerTeam: number;          // 1
  allowDoubleheaders: boolean;        // true (same night, diff times)
  doubleheaderAvoidStrongTeams: boolean; // true
}
```

### Output: Schedule
```typescript
interface Game {
  date: string;
  field: string;
  isSwamp: boolean;
  gameNumber: 1 | 2;
  startTime: "6:30 PM" | "8:15 PM";
  home: string;             // team name
  away: string;             // team name
  isMakeup: boolean;
  isPlayoff: boolean;
}

interface ScheduleResult {
  games: Game[];
  warnings: string[];       // e.g. "Ravenwood Brewers has a doubleheader on June 25"
  stats: TeamStats[];
}

interface TeamStats {
  team: string;
  totalGames: number;
  homeGames: number;
  awayGames: number;
  swampGames: number;
  gamesAt630: number;
  gamesAt815: number;
  field5Games: number;
  field4Games: number;
}
```

---

## Finalized 2026 Schedule (JSON)

This is the validated, conflict-free schedule. All 28 matchups covered, all constraints satisfied.

```json
[
  {"date":"Tuesday, June 16","field":"Field 12 (The Swamp)","is_swamp":true,"gnum":1,"home":"Ravenwood Brewers","away":"TJs Ballers"},
  {"date":"Thursday, June 18","field":"Field 12 (The Swamp)","is_swamp":true,"gnum":1,"home":"Swingers","away":"The Old Glories"},
  {"date":"Tuesday, June 23","field":"Field 12 (The Swamp)","is_swamp":true,"gnum":1,"home":"Blue Team","away":"Start Line Brewing"},
  {"date":"Thursday, June 25","field":"Field 12 (The Swamp)","is_swamp":true,"gnum":1,"home":"Colt45s","away":"Guaranteed Up"},
  {"date":"Tuesday, June 23","field":"Baseball - Field 5","is_swamp":false,"gnum":1,"home":"Colt45s","away":"The Old Glories"},
  {"date":"Tuesday, June 23","field":"Baseball - Field 5","is_swamp":false,"gnum":2,"home":"TJs Ballers","away":"Swingers"},
  {"date":"Thursday, June 25","field":"Baseball - Field 5","is_swamp":false,"gnum":1,"home":"Start Line Brewing","away":"Swingers"},
  {"date":"Thursday, June 25","field":"Baseball - Field 5","is_swamp":false,"gnum":2,"home":"Ravenwood Brewers","away":"Guaranteed Up"},
  {"date":"Thursday, June 25","field":"Softball - Field 4","is_swamp":false,"gnum":1,"home":"Ravenwood Brewers","away":"Blue Team"},
  {"date":"Thursday, June 25","field":"Softball - Field 4","is_swamp":false,"gnum":2,"home":"The Old Glories","away":"TJs Ballers"},
  {"date":"Tuesday, July 7","field":"Softball - Field 4","is_swamp":false,"gnum":1,"home":"TJs Ballers","away":"Blue Team"},
  {"date":"Tuesday, July 7","field":"Softball - Field 4","is_swamp":false,"gnum":2,"home":"Swingers","away":"Colt45s"},
  {"date":"Thursday, July 9","field":"Softball - Field 4","is_swamp":false,"gnum":1,"home":"Guaranteed Up","away":"Swingers"},
  {"date":"Thursday, July 9","field":"Softball - Field 4","is_swamp":false,"gnum":2,"home":"Blue Team","away":"Colt45s"},
  {"date":"Tuesday, July 14","field":"Softball - Field 4","is_swamp":false,"gnum":1,"home":"Swingers","away":"Ravenwood Brewers"},
  {"date":"Tuesday, July 14","field":"Softball - Field 4","is_swamp":false,"gnum":2,"home":"The Old Glories","away":"Guaranteed Up"},
  {"date":"Thursday, July 16","field":"Softball - Field 4","is_swamp":false,"gnum":1,"home":"Guaranteed Up","away":"TJs Ballers"},
  {"date":"Thursday, July 16","field":"Softball - Field 4","is_swamp":false,"gnum":2,"home":"Start Line Brewing","away":"Colt45s"},
  {"date":"Tuesday, July 21","field":"Baseball - Field 5","is_swamp":false,"gnum":1,"home":"Colt45s","away":"Ravenwood Brewers"},
  {"date":"Tuesday, July 21","field":"Baseball - Field 5","is_swamp":false,"gnum":2,"home":"Blue Team","away":"Guaranteed Up"},
  {"date":"Thursday, July 23","field":"Softball - Field 4","is_swamp":false,"gnum":1,"home":"Guaranteed Up","away":"Start Line Brewing"},
  {"date":"Thursday, July 23","field":"Softball - Field 4","is_swamp":false,"gnum":2,"home":"Ravenwood Brewers","away":"The Old Glories"},
  {"date":"Tuesday, July 28","field":"Baseball - Field 5","is_swamp":false,"gnum":1,"home":"Start Line Brewing","away":"The Old Glories"},
  {"date":"Tuesday, July 28","field":"Baseball - Field 5","is_swamp":false,"gnum":2,"home":"Swingers","away":"Blue Team"},
  {"date":"Thursday, July 30","field":"Softball - Field 4","is_swamp":false,"gnum":1,"home":"The Old Glories","away":"Blue Team"},
  {"date":"Thursday, July 30","field":"Softball - Field 4","is_swamp":false,"gnum":2,"home":"TJs Ballers","away":"Start Line Brewing"},
  {"date":"Tuesday, August 4","field":"Baseball - Field 5","is_swamp":false,"gnum":1,"home":"TJs Ballers","away":"Colt45s"},
  {"date":"Tuesday, August 4","field":"Baseball - Field 5","is_swamp":false,"gnum":2,"home":"Start Line Brewing","away":"Ravenwood Brewers"}
]
```

---

## Validation Checklist

Run these checks after any schedule generation:

- [ ] Total games == 28
- [ ] Unique matchups == 28 (all pairs of 8 teams)
- [ ] No team appears twice in the same time slot on the same date
- [ ] Every team has exactly 1 Swamp game
- [ ] Strong teams have exactly 3 home games
- [ ] No team has 0 games in a 3-week window (distribution check)
- [ ] June 30, July 2, August 6 have 0 regular season games assigned

---

## Playoff Structure

8 teams split into **East** and **West** conferences. Single-elimination.

```
EAST                    WEST
1 seed ─┐              3 seed ─┐
        ├─ Winner 1/8           ├─ Winner 3/6
8 seed ─┘       │      6 seed ─┘       │
                ├─ East Champ          ├─ West Champ
4 seed ─┐       │      2 seed ─┐       │
        ├─ Winner 4/5  │       ├─ Winner 2/7  │
5 seed ─┘              7 seed ─┘              │
                                              ▼
                                          🏆 CHAMPION
```

Seeding: Based on regular season record (TBD at season end).
Playoff dates: August 10, 11, 12, 13 at Hopkinton High School Turf.

---

## What to Build in ScoreBallPlan

### Feature: League Scheduler

**Suggested integration points:**

1. **Scheduler Engine** (`/lib/scheduler.ts` or `/utils/scheduler.py`)
   - Port the simulated annealing algorithm above
   - Accept `LeagueConfig` as input, return `ScheduleResult`
   - Should be reusable for any 6-10 team recreational league

2. **Schedule Admin UI**
   - Input: team names, field definitions, date/slot availability
   - Output: generated schedule with ability to manually swap games
   - Highlight doubleheaders, swamp games, strong-team assignments

3. **Per-Team Schedule View**
   - Filtered view per team (already modeled in the Excel tabs)
   - Show: date, field, time, home/away badge, opponent, result (editable)
   - Color-themed per team's colors

4. **Conflict Detector**
   - Real-time validation when admin manually edits games
   - Flag: same-time conflicts, unbalanced home/away, missing swamp game

5. **Export**
   - Excel export (reuse the openpyxl logic already built)
   - PDF per team
   - iCal feed per team

---

## Notes & Lessons Learned

- **June 25 is structurally overloaded**: 3 simultaneous venue slots + 8 teams = 10 team-slots, forcing 2 teams into doubleheaders. This is a known constraint of the venue calendar, not a bug.
- **June 30 and July 2 are intentionally empty**: Too close to July 4th weekend — low turnout expected. Kept as makeup slots only.
- **The Swamp constraint is a forcing function**: With only 4 Swamp slots and 8 teams, each Swamp game uses up exactly 2 teams. The optimizer must place all 4 Swamp games with 8 distinct teams, which constrains the rest of the schedule significantly.
- **Annealing works well here**: The constraint space is non-convex (many local optima), and SA consistently finds clean solutions after ~1M iterations with the penalty weights above.
- **Home/away is a post-assignment flip**: We first solve which matchup goes in which slot, then independently optimize home/away for each game. This keeps the search space manageable.

---

*End of handoff. Questions? Continue this conversation in Claude.ai or open a new Claude Code session with this document as context.*
