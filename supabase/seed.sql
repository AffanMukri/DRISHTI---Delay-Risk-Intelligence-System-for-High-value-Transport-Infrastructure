-- Generated from src/data/projects.ts and src/data/warnings.ts.
-- Run: npm run db:seed:generate
-- This file contains synthetic demonstration data only.

begin;

set local statement_timeout = '120s';

insert into public.ministries (code, name, metadata)
values
  ('MIN-001', 'Ministry of Civil Aviation', '{"seed":true}'::jsonb),
  ('MIN-002', 'Ministry of Coal', '{"seed":true}'::jsonb),
  ('MIN-003', 'Ministry of Commerce & Industry', '{"seed":true}'::jsonb),
  ('MIN-004', 'Ministry of Communications', '{"seed":true}'::jsonb),
  ('MIN-005', 'Ministry of Education', '{"seed":true}'::jsonb),
  ('MIN-006', 'Ministry of Electronics & IT', '{"seed":true}'::jsonb),
  ('MIN-007', 'Ministry of Health & Family Welfare', '{"seed":true}'::jsonb),
  ('MIN-008', 'Ministry of Housing & Urban Affairs', '{"seed":true}'::jsonb),
  ('MIN-009', 'Ministry of Jal Shakti', '{"seed":true}'::jsonb),
  ('MIN-010', 'Ministry of New & Renewable Energy', '{"seed":true}'::jsonb),
  ('MIN-011', 'Ministry of Petroleum & Natural Gas', '{"seed":true}'::jsonb),
  ('MIN-012', 'Ministry of Ports, Shipping & Waterways', '{"seed":true}'::jsonb),
  ('MIN-013', 'Ministry of Power', '{"seed":true}'::jsonb),
  ('MIN-014', 'Ministry of Railways', '{"seed":true}'::jsonb),
  ('MIN-015', 'Ministry of Road Transport & Highways', '{"seed":true}'::jsonb),
  ('MIN-016', 'Ministry of Steel', '{"seed":true}'::jsonb)
on conflict (code) do update set
  name = excluded.name,
  metadata = public.ministries.metadata || excluded.metadata;

insert into public.agencies (code, name, ministry_id, metadata)
select values_table.code, values_table.name, ministries.id, '{"seed":true}'::jsonb
from (values
  ('AGY-001', 'BSNL / State Implementation Agencies', 'Ministry of Communications'),
  ('AGY-002', 'Bihar Industrial Area Development Authority', 'Ministry of Commerce & Industry'),
  ('AGY-003', 'Border Roads Organisation', 'Ministry of Road Transport & Highways'),
  ('AGY-004', 'CPWD', 'Ministry of Education'),
  ('AGY-005', 'CPWD / AIIMS Governing Bodies', 'Ministry of Health & Family Welfare'),
  ('AGY-006', 'Chennai Metro Rail Ltd.', 'Ministry of Housing & Urban Affairs'),
  ('AGY-007', 'City and Industrial Development Corporation', 'Ministry of Civil Aviation'),
  ('AGY-008', 'Dedicated Freight Corridor Corporation of India Ltd.', 'Ministry of Railways'),
  ('AGY-009', 'DoT / C-DOT', 'Ministry of Communications'),
  ('AGY-010', 'GAIL (India) Ltd.', 'Ministry of Petroleum & Natural Gas'),
  ('AGY-011', 'IWAI', 'Ministry of Ports, Shipping & Waterways'),
  ('AGY-012', 'Indian Oil Corporation Ltd.', 'Ministry of Petroleum & Natural Gas'),
  ('AGY-013', 'Krishnapatnam Port Company Ltd.', 'Ministry of Ports, Shipping & Waterways'),
  ('AGY-014', 'Maha Metro', 'Ministry of Housing & Urban Affairs'),
  ('AGY-015', 'NHAI', 'Ministry of Road Transport & Highways'),
  ('AGY-016', 'NHAI / MSRDC', 'Ministry of Road Transport & Highways'),
  ('AGY-017', 'NHIDCL', 'Ministry of Road Transport & Highways'),
  ('AGY-018', 'NHIDCL / APCO Infratech', 'Ministry of Road Transport & Highways'),
  ('AGY-019', 'NHIDCL / BRO', 'Ministry of Road Transport & Highways'),
  ('AGY-020', 'NHPC Limited', 'Ministry of Power'),
  ('AGY-021', 'NTPC Limited', 'Ministry of Power'),
  ('AGY-022', 'NWDA / Ken–Betwa Link Project Authority', 'Ministry of Jal Shakti'),
  ('AGY-023', 'National High Speed Rail Corporation Ltd.', 'Ministry of Railways'),
  ('AGY-024', 'Nuclear Power Corporation of India Ltd.', 'Ministry of Power'),
  ('AGY-025', 'PHED Rajasthan', 'Ministry of Jal Shakti'),
  ('AGY-026', 'Polavaram Project Authority', 'Ministry of Jal Shakti'),
  ('AGY-027', 'REC Ltd. / State DISCOMs', 'Ministry of Power'),
  ('AGY-028', 'Rail Vikas Nigam Ltd.', 'Ministry of Railways'),
  ('AGY-029', 'Rajasthan Rajya Vidyut Utpadan Nigam Ltd.', 'Ministry of Coal'),
  ('AGY-030', 'SECI / Gujarat UrjaVikas Nigam', 'Ministry of New & Renewable Energy'),
  ('AGY-031', 'Tata Electronics Pvt. Ltd.', 'Ministry of Electronics & IT'),
  ('AGY-032', 'Tata Steel Limited', 'Ministry of Steel'),
  ('AGY-033', 'UJVN Ltd.', 'Ministry of Jal Shakti'),
  ('AGY-034', 'UPMRC', 'Ministry of Housing & Urban Affairs'),
  ('AGY-035', 'Uttar Pradesh Expressway Industrial Development Authority', 'Ministry of Road Transport & Highways'),
  ('AGY-036', 'Vadhvan Port Project Ltd.', 'Ministry of Ports, Shipping & Waterways'),
  ('AGY-037', 'Zurich Airport International AG / YIAPL', 'Ministry of Civil Aviation')
) as values_table(code, name, ministry_name)
join public.ministries on ministries.name = values_table.ministry_name
on conflict (code) do update set
  name = excluded.name,
  ministry_id = excluded.ministry_id,
  metadata = public.agencies.metadata || excluded.metadata;

insert into public.projects (
  project_code, name, ministry_id, agency_id, department, sector, project_type,
  state_display, states, description, status, approved_cost, revised_cost,
  expenditure, physical_progress, planned_progress, financial_progress,
  original_completion_date, revised_completion_date, delay_days, last_reported_at,
  cost_breakdown, latitude, longitude, source_system, source_record_id,
  data_quality_status, raw_payload, metadata
)
select
  values_table.project_code,
  values_table.name,
  ministries.id,
  agencies.id,
  values_table.department,
  values_table.sector,
  values_table.project_type,
  values_table.state_display,
  values_table.states,
  values_table.description,
  values_table.status::public.project_status,
  values_table.approved_cost,
  values_table.revised_cost,
  values_table.expenditure,
  values_table.physical_progress,
  values_table.planned_progress,
  values_table.financial_progress,
  values_table.original_completion_date,
  values_table.revised_completion_date,
  values_table.delay_days,
  values_table.last_reported_at,
  values_table.cost_breakdown,
  values_table.latitude,
  values_table.longitude,
  'PRAGATI-X-DEMO',
  values_table.project_code,
  'validated'::public.data_quality_status,
  values_table.raw_payload,
  '{"seed":true,"synthetic":true}'::jsonb
from (values
  (
    'PRJ-001', 'Mumbai–Ahmedabad High Speed Rail Corridor', 'Ministry of Railways', 'National High Speed Rail Corporation Ltd.',
    'National High Speed Rail Corporation', 'Transport & Logistics', 'Rail Infrastructure',
    'Maharashtra / Gujarat', array['Maharashtra', 'Gujarat']::text[],
    'India''s first high-speed rail project connecting Mumbai and Ahmedabad, designed for speeds up to 320 km/h.', 'active',
    110000, 127500, 41200,
    34, 52, 37,
    '2026-08-15'::date, '2028-03-31'::date, 594,
    '2026-04-30T00:00:00Z'::timestamptz, '{"materialCosts":42,"scopeChanges":28,"delayedExecution":18,"contractualChanges":8,"otherFactors":4}'::jsonb, 21.19, 72.83,
    '{"legacyProjectId":"PRJ-001","legacyLastUpdated":"2026-04-30"}'::jsonb
  ),
  (
    'PRJ-002', 'Delhi–Varanasi High Speed Rail', 'Ministry of Railways', 'Rail Vikas Nigam Ltd.',
    'Railway Board', 'Transport & Logistics', 'Rail Infrastructure',
    'Uttar Pradesh / Delhi', array['Uttar Pradesh', 'Delhi']::text[],
    'High-speed rail corridor linking Delhi with Varanasi via Agra and Lucknow.', 'active',
    97800, 104600, 18200,
    18, 28, 18,
    '2027-12-31'::date, '2028-09-30'::date, 273,
    '2026-04-28T00:00:00Z'::timestamptz, '{"materialCosts":38,"scopeChanges":32,"delayedExecution":15,"contractualChanges":10,"otherFactors":5}'::jsonb, 25.3176, 82.9739,
    '{"legacyProjectId":"PRJ-002","legacyLastUpdated":"2026-04-28"}'::jsonb
  ),
  (
    'PRJ-003', 'Eastern Dedicated Freight Corridor — Phase II', 'Ministry of Railways', 'Dedicated Freight Corridor Corporation of India Ltd.',
    'Dedicated Freight Corridor Corporation', 'Transport & Logistics', 'Rail Freight Infrastructure',
    'Uttar Pradesh / Bihar', array['Uttar Pradesh', 'Bihar']::text[],
    'Extension of Eastern DFC covering Sonnagar–Dankuni section to enhance freight capacity.', 'active',
    32500, 34800, 28600,
    88, 92, 87,
    '2025-12-31'::date, '2026-08-31'::date, 243,
    '2026-04-30T00:00:00Z'::timestamptz, '{"materialCosts":35,"scopeChanges":15,"delayedExecution":30,"contractualChanges":12,"otherFactors":8}'::jsonb, 25.5941, 85.1376,
    '{"legacyProjectId":"PRJ-003","legacyLastUpdated":"2026-04-30"}'::jsonb
  ),
  (
    'PRJ-004', 'Delhi–Mumbai Expressway (Phase II)', 'Ministry of Road Transport & Highways', 'NHAI',
    'National Highways Authority of India', 'Transport & Logistics', 'Highway',
    'Rajasthan / Gujarat', array['Rajasthan', 'Gujarat']::text[],
    'Eight-lane access-controlled expressway completing the Delhi–Mumbai Expressway network.', 'active',
    48200, 51800, 22400,
    52, 58, 46,
    '2026-06-30'::date, '2026-12-31'::date, 184,
    '2026-04-29T00:00:00Z'::timestamptz, '{"materialCosts":40,"scopeChanges":22,"delayedExecution":20,"contractualChanges":12,"otherFactors":6}'::jsonb, 25.2138, 75.8648,
    '{"legacyProjectId":"PRJ-004","legacyLastUpdated":"2026-04-29"}'::jsonb
  ),
  (
    'PRJ-005', 'Char Dham All-Weather Connectivity', 'Ministry of Road Transport & Highways', 'NHIDCL / BRO',
    'Border Roads Organisation', 'Transport & Logistics', 'Highway / Mountain Road',
    'Uttarakhand', array['Uttarakhand']::text[],
    'All-weather connectivity to Char Dham through widening of national highways.', 'active',
    12000, 13800, 9800,
    78, 85, 81,
    '2024-12-31'::date, '2026-06-30'::date, 547,
    '2026-04-25T00:00:00Z'::timestamptz, '{"materialCosts":30,"scopeChanges":35,"delayedExecution":22,"contractualChanges":8,"otherFactors":5}'::jsonb, 30.7333, 79.0667,
    '{"legacyProjectId":"PRJ-005","legacyLastUpdated":"2026-04-25"}'::jsonb
  ),
  (
    'PRJ-006', 'Pune Ring Road Project', 'Ministry of Road Transport & Highways', 'NHAI / MSRDC',
    'NHAI', 'Transport & Logistics', 'Urban Highway',
    'Maharashtra', array['Maharashtra']::text[],
    'Peripheral ring road around Pune to decongest city traffic and improve connectivity.', 'active',
    26400, 27100, 8200,
    32, 30, 31,
    '2027-12-31'::date, '2028-03-31'::date, 91,
    '2026-04-28T00:00:00Z'::timestamptz, '{"materialCosts":42,"scopeChanges":18,"delayedExecution":10,"contractualChanges":22,"otherFactors":8}'::jsonb, 18.5204, 73.8567,
    '{"legacyProjectId":"PRJ-006","legacyLastUpdated":"2026-04-28"}'::jsonb
  ),
  (
    'PRJ-007', 'Kudankulam Nuclear Power Plant Units 5 & 6', 'Ministry of Power', 'Nuclear Power Corporation of India Ltd.',
    'Department of Atomic Energy', 'Energy', 'Nuclear Power',
    'Tamil Nadu', array['Tamil Nadu']::text[],
    'Construction of two additional 1000 MW VVER nuclear reactors at Kudankulam.', 'active',
    39400, 45800, 12600,
    28, 38, 31,
    '2027-06-30'::date, '2028-12-31'::date, 549,
    '2026-04-30T00:00:00Z'::timestamptz, '{"materialCosts":28,"scopeChanges":42,"delayedExecution":18,"contractualChanges":8,"otherFactors":4}'::jsonb, 8.1701, 77.711,
    '{"legacyProjectId":"PRJ-007","legacyLastUpdated":"2026-04-30"}'::jsonb
  ),
  (
    'PRJ-008', 'Tapti Basin Ultra Mega Solar Park', 'Ministry of New & Renewable Energy', 'SECI / Gujarat UrjaVikas Nigam',
    'Solar Energy Corporation of India', 'Energy', 'Solar Energy',
    'Gujarat', array['Gujarat']::text[],
    '10 GW ultra-mega solar park in Gujarat to support renewable energy targets.', 'active',
    18600, 19200, 11800,
    62, 65, 63,
    '2026-09-30'::date, '2026-12-31'::date, 92,
    '2026-04-29T00:00:00Z'::timestamptz, '{"materialCosts":55,"scopeChanges":10,"delayedExecution":15,"contractualChanges":12,"otherFactors":8}'::jsonb, 21.1702, 72.8311,
    '{"legacyProjectId":"PRJ-008","legacyLastUpdated":"2026-04-29"}'::jsonb
  ),
  (
    'PRJ-009', 'Vindhyachal Super Thermal Power Station — Stage VI', 'Ministry of Power', 'NTPC Limited',
    'NTPC Ltd.', 'Energy', 'Thermal Power',
    'Madhya Pradesh', array['Madhya Pradesh']::text[],
    'Addition of 2×660 MW supercritical coal-based units at Vindhyachal.', 'active',
    14200, 15600, 6800,
    47, 55, 47,
    '2026-03-31'::date, '2027-03-31'::date, 365,
    '2026-04-28T00:00:00Z'::timestamptz, '{"materialCosts":38,"scopeChanges":20,"delayedExecution":28,"contractualChanges":10,"otherFactors":4}'::jsonb, 24.0955, 82.6667,
    '{"legacyProjectId":"PRJ-009","legacyLastUpdated":"2026-04-28"}'::jsonb
  ),
  (
    'PRJ-010', 'Ken–Betwa River Interlinking Project', 'Ministry of Jal Shakti', 'NWDA / Ken–Betwa Link Project Authority',
    'National Water Development Agency', 'Water & Sanitation', 'River Interlinking',
    'Madhya Pradesh / Uttar Pradesh', array['Madhya Pradesh', 'Uttar Pradesh']::text[],
    'First inter-basin water transfer project linking Ken and Betwa rivers to provide irrigation and drinking water.', 'active',
    44605, 48900, 8400,
    14, 22, 18,
    '2028-03-31'::date, '2030-03-31'::date, 731,
    '2026-04-27T00:00:00Z'::timestamptz, '{"materialCosts":32,"scopeChanges":28,"delayedExecution":22,"contractualChanges":12,"otherFactors":6}'::jsonb, 24.4539, 79.75,
    '{"legacyProjectId":"PRJ-010","legacyLastUpdated":"2026-04-27"}'::jsonb
  ),
  (
    'PRJ-011', 'Jal Jeevan Mission — Rajasthan Cluster', 'Ministry of Jal Shakti', 'PHED Rajasthan',
    'Department of Drinking Water & Sanitation', 'Water & Sanitation', 'Water Supply',
    'Rajasthan', array['Rajasthan']::text[],
    'Tap water connections to rural households across Rajasthan under Jal Jeevan Mission.', 'active',
    28600, 29400, 19800,
    71, 74, 69,
    '2026-03-31'::date, '2026-09-30'::date, 183,
    '2026-04-29T00:00:00Z'::timestamptz, '{"materialCosts":45,"scopeChanges":12,"delayedExecution":18,"contractualChanges":15,"otherFactors":10}'::jsonb, 27.0238, 74.2179,
    '{"legacyProjectId":"PRJ-011","legacyLastUpdated":"2026-04-29"}'::jsonb
  ),
  (
    'PRJ-012', 'BharatNet Phase III — Eastern States', 'Ministry of Communications', 'BSNL / State Implementation Agencies',
    'Department of Telecommunications', 'Communication', 'Telecom Infrastructure',
    'West Bengal / Odisha / Jharkhand', array['West Bengal', 'Odisha', 'Jharkhand']::text[],
    'Optical fibre connectivity to Gram Panchayats in Eastern India under BharatNet.', 'active',
    22400, 24100, 7600,
    31, 45, 33,
    '2026-12-31'::date, '2027-09-30'::date, 273,
    '2026-04-28T00:00:00Z'::timestamptz, '{"materialCosts":48,"scopeChanges":18,"delayedExecution":20,"contractualChanges":10,"otherFactors":4}'::jsonb, 22.9868, 87.855,
    '{"legacyProjectId":"PRJ-012","legacyLastUpdated":"2026-04-28"}'::jsonb
  ),
  (
    'PRJ-013', 'PM-WANI Public Wi-Fi Expansion', 'Ministry of Communications', 'DoT / C-DOT',
    'Department of Telecommunications', 'Communication', 'Digital Connectivity',
    'Pan India', array['Pan India']::text[],
    'Expansion of public Wi-Fi hotspots through PM-WANI framework across India.', 'active',
    4800, 5100, 3200,
    68, 70, 66,
    '2026-06-30'::date, '2026-09-30'::date, 92,
    '2026-04-30T00:00:00Z'::timestamptz, '{"materialCosts":35,"scopeChanges":10,"delayedExecution":12,"contractualChanges":28,"otherFactors":15}'::jsonb, 28.6139, 77.209,
    '{"legacyProjectId":"PRJ-013","legacyLastUpdated":"2026-04-30"}'::jsonb
  ),
  (
    'PRJ-014', 'AIIMS Expansion — Deoghar & Rajkot', 'Ministry of Health & Family Welfare', 'CPWD / AIIMS Governing Bodies',
    'Department of Health', 'Social Infrastructure', 'Healthcare Infrastructure',
    'Jharkhand / Gujarat', array['Jharkhand', 'Gujarat']::text[],
    'Construction of two new AIIMS campuses at Deoghar (Jharkhand) and Rajkot (Gujarat).', 'active',
    7200, 8100, 4800,
    62, 72, 66,
    '2025-12-31'::date, '2026-09-30'::date, 273,
    '2026-04-26T00:00:00Z'::timestamptz, '{"materialCosts":38,"scopeChanges":25,"delayedExecution":22,"contractualChanges":10,"otherFactors":5}'::jsonb, 24.4818, 86.694,
    '{"legacyProjectId":"PRJ-014","legacyLastUpdated":"2026-04-26"}'::jsonb
  ),
  (
    'PRJ-015', 'Central University of Kashmir Campus Development', 'Ministry of Education', 'CPWD',
    'University Grants Commission', 'Social Infrastructure', 'Educational Infrastructure',
    'Jammu & Kashmir', array['Jammu & Kashmir']::text[],
    'Permanent campus development for Central University of Kashmir at Ganderbal.', 'active',
    3200, 3950, 2100,
    56, 68, 65,
    '2025-03-31'::date, '2026-12-31'::date, 641,
    '2026-04-25T00:00:00Z'::timestamptz, '{"materialCosts":30,"scopeChanges":35,"delayedExecution":20,"contractualChanges":10,"otherFactors":5}'::jsonb, 34.2268, 74.7742,
    '{"legacyProjectId":"PRJ-015","legacyLastUpdated":"2026-04-25"}'::jsonb
  ),
  (
    'PRJ-016', 'Parsa East & Kanta Basan Coal Block Development', 'Ministry of Coal', 'Rajasthan Rajya Vidyut Utpadan Nigam Ltd.',
    'Coal India Ltd.', 'Coal', 'Coal Mining',
    'Chhattisgarh', array['Chhattisgarh']::text[],
    'Open-cast coal mining project to supply coal to Rajasthan power plants.', 'active',
    9800, 10600, 5200,
    55, 60, 53,
    '2026-06-30'::date, '2026-12-31'::date, 184,
    '2026-04-28T00:00:00Z'::timestamptz, '{"materialCosts":28,"scopeChanges":22,"delayedExecution":30,"contractualChanges":12,"otherFactors":8}'::jsonb, 23, 82.5,
    '{"legacyProjectId":"PRJ-016","legacyLastUpdated":"2026-04-28"}'::jsonb
  ),
  (
    'PRJ-017', 'Kalinganagar Integrated Steel Plant Expansion', 'Ministry of Steel', 'Tata Steel Limited',
    'Steel Authority of India Ltd.', 'Steel', 'Steel Manufacturing',
    'Odisha', array['Odisha']::text[],
    'Expansion of Kalinganagar steel plant capacity from 3 MTPA to 8 MTPA.', 'active',
    23600, 26800, 18900,
    74, 78, 80,
    '2026-03-31'::date, '2026-09-30'::date, 183,
    '2026-04-27T00:00:00Z'::timestamptz, '{"materialCosts":40,"scopeChanges":18,"delayedExecution":22,"contractualChanges":12,"otherFactors":8}'::jsonb, 21.12, 85.9,
    '{"legacyProjectId":"PRJ-017","legacyLastUpdated":"2026-04-27"}'::jsonb
  ),
  (
    'PRJ-018', 'Pune Metro Phase 2', 'Ministry of Housing & Urban Affairs', 'Maha Metro',
    'Pune Metropolitan Region Development Authority', 'Transport & Logistics', 'Urban Metro Rail',
    'Maharashtra', array['Maharashtra']::text[],
    'Metro rail expansion covering Hinjewadi IT Park and Shivajinagar corridor.', 'active',
    31200, 33400, 9800,
    30, 35, 31,
    '2028-03-31'::date, '2028-09-30'::date, 183,
    '2026-04-29T00:00:00Z'::timestamptz, '{"materialCosts":42,"scopeChanges":20,"delayedExecution":15,"contractualChanges":18,"otherFactors":5}'::jsonb, 18.5204, 73.8567,
    '{"legacyProjectId":"PRJ-018","legacyLastUpdated":"2026-04-29"}'::jsonb
  ),
  (
    'PRJ-019', 'Chennai Metro Phase 2 — Line 4', 'Ministry of Housing & Urban Affairs', 'Chennai Metro Rail Ltd.',
    'Chennai Metro Rail Ltd.', 'Transport & Logistics', 'Urban Metro Rail',
    'Tamil Nadu', array['Tamil Nadu']::text[],
    'Metro rail corridor from Lighthouse to Poonamallee, spanning 47 km.', 'active',
    61843, 67200, 18500,
    27, 32, 29,
    '2028-12-31'::date, '2029-06-30'::date, 181,
    '2026-04-26T00:00:00Z'::timestamptz, '{"materialCosts":45,"scopeChanges":22,"delayedExecution":12,"contractualChanges":15,"otherFactors":6}'::jsonb, 13.0827, 80.2707,
    '{"legacyProjectId":"PRJ-019","legacyLastUpdated":"2026-04-26"}'::jsonb
  ),
  (
    'PRJ-020', 'Agra Metro Rail Project', 'Ministry of Housing & Urban Affairs', 'UPMRC',
    'Uttar Pradesh Metro Rail Corporation', 'Transport & Logistics', 'Urban Metro Rail',
    'Uttar Pradesh', array['Uttar Pradesh']::text[],
    'Metro rail system for Agra covering two corridors totalling 29.4 km.', 'active',
    8379, 9100, 6200,
    72, 75, 74,
    '2026-03-31'::date, '2026-09-30'::date, 183,
    '2026-04-27T00:00:00Z'::timestamptz, '{"materialCosts":38,"scopeChanges":22,"delayedExecution":20,"contractualChanges":12,"otherFactors":8}'::jsonb, 27.1767, 78.0081,
    '{"legacyProjectId":"PRJ-020","legacyLastUpdated":"2026-04-27"}'::jsonb
  ),
  (
    'PRJ-021', 'Vadhvan Greenfield Port Development', 'Ministry of Ports, Shipping & Waterways', 'Vadhvan Port Project Ltd.',
    'Jawaharlal Nehru Port Authority', 'Transport & Logistics', 'Port Infrastructure',
    'Maharashtra', array['Maharashtra']::text[],
    'Development of India''s largest greenfield deep-water port at Vadhvan, Maharashtra.', 'active',
    76220, 82400, 12400,
    14, 18, 16,
    '2030-03-31'::date, '2031-03-31'::date, 365,
    '2026-04-28T00:00:00Z'::timestamptz, '{"materialCosts":35,"scopeChanges":30,"delayedExecution":20,"contractualChanges":10,"otherFactors":5}'::jsonb, 20.25, 72.9167,
    '{"legacyProjectId":"PRJ-021","legacyLastUpdated":"2026-04-28"}'::jsonb
  ),
  (
    'PRJ-022', 'Zojila Tunnel Project', 'Ministry of Road Transport & Highways', 'NHIDCL / APCO Infratech',
    'NHIDCL', 'Transport & Logistics', 'Tunnel / Mountain Road',
    'Jammu & Kashmir', array['Jammu & Kashmir']::text[],
    '14.2 km all-weather tunnel connecting Srinagar with Ladakh through the Zoji La pass.', 'active',
    6809, 8100, 4600,
    64, 72, 67,
    '2026-09-30'::date, '2027-06-30'::date, 273,
    '2026-04-28T00:00:00Z'::timestamptz, '{"materialCosts":28,"scopeChanges":38,"delayedExecution":22,"contractualChanges":8,"otherFactors":4}'::jsonb, 34.1918, 75.4867,
    '{"legacyProjectId":"PRJ-022","legacyLastUpdated":"2026-04-28"}'::jsonb
  ),
  (
    'PRJ-023', 'Rishikesh–Karnaprayag Rail Link', 'Ministry of Railways', 'Rail Vikas Nigam Ltd.',
    'Railway Board / RVNL', 'Transport & Logistics', 'Rail Infrastructure',
    'Uttarakhand', array['Uttarakhand']::text[],
    '125 km mountain railway with 105 km of tunnels connecting Rishikesh to Karnaprayag.', 'active',
    16216, 20500, 7200,
    42, 55, 44,
    '2024-12-31'::date, '2027-12-31'::date, 1095,
    '2026-04-26T00:00:00Z'::timestamptz, '{"materialCosts":25,"scopeChanges":42,"delayedExecution":20,"contractualChanges":8,"otherFactors":5}'::jsonb, 30.1069, 78.9,
    '{"legacyProjectId":"PRJ-023","legacyLastUpdated":"2026-04-26"}'::jsonb
  ),
  (
    'PRJ-024', 'Polavaram Multipurpose Project', 'Ministry of Jal Shakti', 'Polavaram Project Authority',
    'Andhra Pradesh Government', 'Water & Sanitation', 'Multipurpose Dam',
    'Andhra Pradesh', array['Andhra Pradesh']::text[],
    'National project providing irrigation, drinking water and power generation on the Godavari river.', 'active',
    55548, 71000, 32000,
    52, 72, 57,
    '2022-12-31'::date, '2027-03-31'::date, 1552,
    '2026-04-29T00:00:00Z'::timestamptz, '{"materialCosts":30,"scopeChanges":38,"delayedExecution":18,"contractualChanges":10,"otherFactors":4}'::jsonb, 17.2478, 81.7132,
    '{"legacyProjectId":"PRJ-024","legacyLastUpdated":"2026-04-29"}'::jsonb
  ),
  (
    'PRJ-025', 'Navi Mumbai International Airport — Phase 1', 'Ministry of Civil Aviation', 'City and Industrial Development Corporation',
    'Airports Authority of India', 'Transport & Logistics', 'Airport',
    'Maharashtra', array['Maharashtra']::text[],
    'Greenfield international airport at Navi Mumbai with initial capacity of 20 MPPA.', 'active',
    16700, 18200, 11800,
    68, 75, 70,
    '2025-12-31'::date, '2026-12-31'::date, 365,
    '2026-04-30T00:00:00Z'::timestamptz, '{"materialCosts":40,"scopeChanges":25,"delayedExecution":18,"contractualChanges":12,"otherFactors":5}'::jsonb, 18.97, 73.12,
    '{"legacyProjectId":"PRJ-025","legacyLastUpdated":"2026-04-30"}'::jsonb
  ),
  (
    'PRJ-026', 'Jewar International Airport (Noida International Airport)', 'Ministry of Civil Aviation', 'Zurich Airport International AG / YIAPL',
    'Yamuna International Airport Pvt. Ltd.', 'Transport & Logistics', 'Airport',
    'Uttar Pradesh', array['Uttar Pradesh']::text[],
    'Greenfield international airport in Jewar with ultimate capacity of 70 MPPA.', 'active',
    29560, 31400, 9200,
    31, 38, 31,
    '2024-09-30'::date, '2027-03-31'::date, 913,
    '2026-04-28T00:00:00Z'::timestamptz, '{"materialCosts":38,"scopeChanges":28,"delayedExecution":20,"contractualChanges":10,"otherFactors":4}'::jsonb, 28.19, 77.54,
    '{"legacyProjectId":"PRJ-026","legacyLastUpdated":"2026-04-28"}'::jsonb
  ),
  (
    'PRJ-027', 'Sela Tunnel — Tawang Connectivity', 'Ministry of Road Transport & Highways', 'Border Roads Organisation',
    'Border Roads Organisation', 'Transport & Logistics', 'Tunnel',
    'Arunachal Pradesh', array['Arunachal Pradesh']::text[],
    'World''s longest bi-lane tunnel at altitude, providing all-weather access to Tawang.', 'completed',
    687, 825, 825,
    100, 100, 100,
    '2023-12-31'::date, '2024-02-28'::date, 59,
    '2026-04-01T00:00:00Z'::timestamptz, '{"materialCosts":40,"scopeChanges":30,"delayedExecution":15,"contractualChanges":10,"otherFactors":5}'::jsonb, 27.53, 92.13,
    '{"legacyProjectId":"PRJ-027","legacyLastUpdated":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-028', 'Paradip Refinery Expansion', 'Ministry of Petroleum & Natural Gas', 'Indian Oil Corporation Ltd.',
    'Indian Oil Corporation', 'Energy', 'Petroleum Refinery',
    'Odisha', array['Odisha']::text[],
    'Capacity expansion of Paradip refinery from 15 MMTPA to 25 MMTPA.', 'active',
    34100, 36500, 14200,
    40, 45, 41,
    '2027-03-31'::date, '2027-09-30'::date, 183,
    '2026-04-29T00:00:00Z'::timestamptz, '{"materialCosts":42,"scopeChanges":20,"delayedExecution":18,"contractualChanges":14,"otherFactors":6}'::jsonb, 20.3167, 86.6,
    '{"legacyProjectId":"PRJ-028","legacyLastUpdated":"2026-04-29"}'::jsonb
  ),
  (
    'PRJ-029', 'National Highway 48 — 6-Lane Widening Bengaluru–Chennai', 'Ministry of Road Transport & Highways', 'NHAI',
    'NHAI', 'Transport & Logistics', 'Highway',
    'Karnataka / Tamil Nadu', array['Karnataka', 'Tamil Nadu']::text[],
    '262 km 6-lane widening of NH 48 between Bengaluru and Chennai.', 'active',
    17800, 18400, 12600,
    70, 72, 70,
    '2026-09-30'::date, '2026-12-31'::date, 92,
    '2026-04-30T00:00:00Z'::timestamptz, '{"materialCosts":50,"scopeChanges":15,"delayedExecution":12,"contractualChanges":18,"otherFactors":5}'::jsonb, 12.9716, 79.8,
    '{"legacyProjectId":"PRJ-029","legacyLastUpdated":"2026-04-30"}'::jsonb
  ),
  (
    'PRJ-030', 'Rajiv Gandhi Grameen Vidyutikaran Yojana — NE States', 'Ministry of Power', 'REC Ltd. / State DISCOMs',
    'Rural Electrification Corporation', 'Energy', 'Power Distribution',
    'Assam / Meghalaya / Nagaland', array['Assam', 'Meghalaya', 'Nagaland']::text[],
    'Rural electrification and strengthening of distribution network in North-Eastern states.', 'active',
    8200, 8800, 6100,
    75, 80, 74,
    '2025-12-31'::date, '2026-09-30'::date, 273,
    '2026-04-27T00:00:00Z'::timestamptz, '{"materialCosts":48,"scopeChanges":12,"delayedExecution":22,"contractualChanges":10,"otherFactors":8}'::jsonb, 26.2006, 92.9376,
    '{"legacyProjectId":"PRJ-030","legacyLastUpdated":"2026-04-27"}'::jsonb
  ),
  (
    'PRJ-031', 'Sagarmala Port Connectivity — Krishnapatnam', 'Ministry of Ports, Shipping & Waterways', 'Krishnapatnam Port Company Ltd.',
    'Sagarmala Development Company', 'Transport & Logistics', 'Port Connectivity',
    'Andhra Pradesh', array['Andhra Pradesh']::text[],
    'Connectivity enhancement for Krishnapatnam port including road and rail linkages.', 'active',
    5600, 5900, 3800,
    65, 68, 67,
    '2026-06-30'::date, '2026-09-30'::date, 92,
    '2026-04-28T00:00:00Z'::timestamptz, '{"materialCosts":44,"scopeChanges":15,"delayedExecution":18,"contractualChanges":16,"otherFactors":7}'::jsonb, 14.2632, 80.1252,
    '{"legacyProjectId":"PRJ-031","legacyLastUpdated":"2026-04-28"}'::jsonb
  ),
  (
    'PRJ-032', 'PM Gati Shakti — Multi-Modal Logistics Park, Jogighopa', 'Ministry of Ports, Shipping & Waterways', 'IWAI',
    'IWAI / NF Railway', 'Transport & Logistics', 'Logistics Infrastructure',
    'Assam', array['Assam']::text[],
    'Multi-modal logistics park integrating river, road and rail at Jogighopa, Assam.', 'active',
    2900, 3100, 1400,
    48, 52, 48,
    '2026-12-31'::date, '2027-06-30'::date, 181,
    '2026-04-29T00:00:00Z'::timestamptz, '{"materialCosts":40,"scopeChanges":20,"delayedExecution":18,"contractualChanges":14,"otherFactors":8}'::jsonb, 26.22, 91.55,
    '{"legacyProjectId":"PRJ-032","legacyLastUpdated":"2026-04-29"}'::jsonb
  ),
  (
    'PRJ-033', 'Lakhwar–Vyasi Multipurpose Dam', 'Ministry of Jal Shakti', 'UJVN Ltd.',
    'Uttarakhand Jal Vidyut Nigam', 'Water & Sanitation', 'Dam / Hydropower',
    'Uttarakhand', array['Uttarakhand']::text[],
    'Storage dam on the Yamuna river providing water to Delhi, Haryana and other states.', 'active',
    5796, 8200, 2100,
    28, 42, 36,
    '2025-06-30'::date, '2029-03-31'::date, 1370,
    '2026-04-26T00:00:00Z'::timestamptz, '{"materialCosts":28,"scopeChanges":42,"delayedExecution":18,"contractualChanges":8,"otherFactors":4}'::jsonb, 30.58, 77.92,
    '{"legacyProjectId":"PRJ-033","legacyLastUpdated":"2026-04-26"}'::jsonb
  ),
  (
    'PRJ-034', 'Bihar Special Economic Zone — Darbhanga', 'Ministry of Commerce & Industry', 'Bihar Industrial Area Development Authority',
    'SEZ Authority', 'Social Infrastructure', 'Industrial Infrastructure',
    'Bihar', array['Bihar']::text[],
    'Integrated industrial and SEZ development near Darbhanga to boost manufacturing in Bihar.', 'active',
    4200, 4450, 1800,
    38, 40, 42,
    '2027-03-31'::date, '2027-09-30'::date, 183,
    '2026-04-27T00:00:00Z'::timestamptz, '{"materialCosts":42,"scopeChanges":18,"delayedExecution":15,"contractualChanges":18,"otherFactors":7}'::jsonb, 26.1542, 85.8918,
    '{"legacyProjectId":"PRJ-034","legacyLastUpdated":"2026-04-27"}'::jsonb
  ),
  (
    'PRJ-035', 'Ganga Expressway — Meerut to Prayagraj', 'Ministry of Road Transport & Highways', 'Uttar Pradesh Expressway Industrial Development Authority',
    'UPEIDA', 'Transport & Logistics', 'Expressway',
    'Uttar Pradesh', array['Uttar Pradesh']::text[],
    '594 km six-lane access-controlled expressway along the Ganga river corridor.', 'active',
    36230, 38500, 28000,
    82, 86, 77,
    '2025-12-31'::date, '2026-09-30'::date, 273,
    '2026-04-30T00:00:00Z'::timestamptz, '{"materialCosts":48,"scopeChanges":18,"delayedExecution":18,"contractualChanges":10,"otherFactors":6}'::jsonb, 25.4358, 81.8463,
    '{"legacyProjectId":"PRJ-035","legacyLastUpdated":"2026-04-30"}'::jsonb
  ),
  (
    'PRJ-036', 'Gorakhpur AIIMS Campus', 'Ministry of Health & Family Welfare', 'CPWD',
    'Department of Health & Family Welfare', 'Social Infrastructure', 'Healthcare Infrastructure',
    'Uttar Pradesh', array['Uttar Pradesh']::text[],
    'All India Institute of Medical Sciences campus at Gorakhpur.', 'active',
    4026, 4100, 3600,
    88, 90, 87,
    '2025-12-31'::date, '2026-06-30'::date, 181,
    '2026-04-30T00:00:00Z'::timestamptz, '{"materialCosts":38,"scopeChanges":18,"delayedExecution":20,"contractualChanges":16,"otherFactors":8}'::jsonb, 26.7606, 83.3732,
    '{"legacyProjectId":"PRJ-036","legacyLastUpdated":"2026-04-30"}'::jsonb
  ),
  (
    'PRJ-037', 'National Gas Grid — Kochi–Koottanad–Bangalore–Mangaluru Pipeline', 'Ministry of Petroleum & Natural Gas', 'GAIL (India) Ltd.',
    'GAIL India Ltd.', 'Energy', 'Pipeline Infrastructure',
    'Kerala / Karnataka', array['Kerala', 'Karnataka']::text[],
    '450 km natural gas pipeline to supply LNG/CNG to Kerala and Karnataka.', 'active',
    6200, 6800, 5100,
    82, 85, 82,
    '2025-06-30'::date, '2026-03-31'::date, 274,
    '2026-04-28T00:00:00Z'::timestamptz, '{"materialCosts":40,"scopeChanges":20,"delayedExecution":22,"contractualChanges":12,"otherFactors":6}'::jsonb, 12.9141, 74.856,
    '{"legacyProjectId":"PRJ-037","legacyLastUpdated":"2026-04-28"}'::jsonb
  ),
  (
    'PRJ-038', 'Semiconductor Fab Unit — Tata Electronics, Dholera', 'Ministry of Electronics & IT', 'Tata Electronics Pvt. Ltd.',
    'India Semiconductor Mission', 'Social Infrastructure', 'Semiconductor Manufacturing',
    'Gujarat', array['Gujarat']::text[],
    'India''s first domestic semiconductor fabrication facility in the Dholera Special Investment Region.', 'active',
    91000, 93000, 21000,
    22, 24, 23,
    '2026-12-31'::date, '2027-06-30'::date, 181,
    '2026-04-29T00:00:00Z'::timestamptz, '{"materialCosts":35,"scopeChanges":25,"delayedExecution":12,"contractualChanges":20,"otherFactors":8}'::jsonb, 22.329, 72.22,
    '{"legacyProjectId":"PRJ-038","legacyLastUpdated":"2026-04-29"}'::jsonb
  ),
  (
    'PRJ-039', 'Mangdechhu Hydroelectric Project — Export to Bangladesh', 'Ministry of Power', 'NHPC Limited',
    'NHPC Ltd.', 'Energy', 'Hydropower',
    'Bhutan / Assam (transmission)', array['Bhutan', 'Assam (transmission)']::text[],
    '720 MW run-of-river hydroelectric project on Mangdechhu river with power export to Bangladesh.', 'active',
    7200, 7500, 6800,
    94, 96, 94,
    '2025-12-31'::date, '2026-06-30'::date, 181,
    '2026-04-30T00:00:00Z'::timestamptz, '{"materialCosts":38,"scopeChanges":20,"delayedExecution":22,"contractualChanges":12,"otherFactors":8}'::jsonb, 27.5, 90.75,
    '{"legacyProjectId":"PRJ-039","legacyLastUpdated":"2026-04-30"}'::jsonb
  ),
  (
    'PRJ-040', 'Jammu–Srinagar National Highway — Banihal–Qazigund Tunnel', 'Ministry of Road Transport & Highways', 'NHIDCL',
    'NHIDCL', 'Transport & Logistics', 'Tunnel / Highway',
    'Jammu & Kashmir', array['Jammu & Kashmir']::text[],
    'New two-lane tunnel and approach roads through Pir Panjal range for year-round connectivity.', 'active',
    4200, 5100, 2800,
    54, 65, 66,
    '2025-12-31'::date, '2027-06-30'::date, 547,
    '2026-04-27T00:00:00Z'::timestamptz, '{"materialCosts":28,"scopeChanges":38,"delayedExecution":20,"contractualChanges":10,"otherFactors":4}'::jsonb, 33.5345, 75.2,
    '{"legacyProjectId":"PRJ-040","legacyLastUpdated":"2026-04-27"}'::jsonb
  )
) as values_table(
  project_code, name, ministry_name, agency_name, department, sector, project_type,
  state_display, states, description, status, approved_cost, revised_cost,
  expenditure, physical_progress, planned_progress, financial_progress,
  original_completion_date, revised_completion_date, delay_days, last_reported_at,
  cost_breakdown, latitude, longitude, raw_payload
)
join public.ministries on ministries.name = values_table.ministry_name
left join public.agencies on agencies.name = values_table.agency_name
on conflict (project_code) do update set
  name = excluded.name,
  ministry_id = excluded.ministry_id,
  agency_id = excluded.agency_id,
  department = excluded.department,
  sector = excluded.sector,
  project_type = excluded.project_type,
  state_display = excluded.state_display,
  states = excluded.states,
  description = excluded.description,
  status = excluded.status,
  approved_cost = excluded.approved_cost,
  revised_cost = excluded.revised_cost,
  expenditure = excluded.expenditure,
  physical_progress = excluded.physical_progress,
  planned_progress = excluded.planned_progress,
  financial_progress = excluded.financial_progress,
  original_completion_date = excluded.original_completion_date,
  revised_completion_date = excluded.revised_completion_date,
  delay_days = excluded.delay_days,
  last_reported_at = excluded.last_reported_at,
  cost_breakdown = excluded.cost_breakdown,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  raw_payload = excluded.raw_payload;

insert into public.project_monthly_updates (
  project_id, reporting_month, approved_cost, revised_cost, expenditure,
  physical_progress, planned_progress, financial_progress,
  original_completion_date, revised_completion_date, forecast_completion_date,
  delay_days, milestones_total, milestones_completed, milestones_delayed,
  milestones_at_risk, milestone_snapshot, clearance_status, contract_status,
  issues, remarks, submitted_at, source_system, source_record_id,
  data_quality_status, raw_payload, metadata
)
select
  projects.id,
  values_table.reporting_month,
  values_table.approved_cost,
  values_table.revised_cost,
  values_table.expenditure,
  values_table.physical_progress,
  values_table.planned_progress,
  values_table.financial_progress,
  values_table.original_completion_date,
  values_table.revised_completion_date,
  values_table.revised_completion_date,
  values_table.delay_days,
  values_table.milestones_total,
  values_table.milestones_completed,
  values_table.milestones_delayed,
  values_table.milestones_at_risk,
  values_table.milestone_snapshot,
  '{}'::jsonb,
  values_table.contract_status,
  values_table.issues,
  'Seeded from the frontend synthetic monitoring snapshot.',
  values_table.submitted_at,
  'PRAGATI-X-DEMO',
  values_table.source_record_id,
  'validated'::public.data_quality_status,
  values_table.raw_payload,
  '{"seed":true,"synthetic":true}'::jsonb
from (values
  (
    'PRJ-001', '2026-04-01'::date,
    110000, 127500, 41200,
    34, 52, 37,
    '2026-08-15'::date, '2028-03-31'::date, 594,
    6, 2,
    2,
    2,
    '[{"id":"m1","name":"Land Acquisition Phase 1","plannedDate":"2022-06-30","actualDate":"2023-02-15","status":"Completed","delayDays":230},{"id":"m2","name":"Viaduct Construction Begin","plannedDate":"2023-03-31","actualDate":"2023-11-10","status":"Completed","delayDays":224},{"id":"m3","name":"Tunnel Boring Completion","plannedDate":"2024-09-30","status":"Delayed","delayDays":180},{"id":"m4","name":"50% Viaduct Completion","plannedDate":"2025-03-31","status":"Delayed","delayDays":210},{"id":"m5","name":"Track Laying Commencement","plannedDate":"2025-12-31","status":"At Risk"},{"id":"m6","name":"Systems Integration","plannedDate":"2026-06-30","status":"At Risk"}]'::jsonb, 'active',
    array['Cost Escalation Exceeds Monitoring Threshold', 'Physical Progress Significantly Below Planned Trajectory']::text[], '2026-04-30T00:00:00Z'::timestamptz,
    'PRJ-001:2026-04',
    '{"projectId":"PRJ-001","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-002', '2026-04-01'::date,
    97800, 104600, 18200,
    18, 28, 18,
    '2027-12-31'::date, '2028-09-30'::date, 273,
    4, 2,
    0,
    2,
    '[{"id":"m1","name":"DPR Finalisation","plannedDate":"2023-12-31","actualDate":"2024-03-20","status":"Completed","delayDays":80},{"id":"m2","name":"Land Acquisition Start","plannedDate":"2024-06-30","actualDate":"2024-09-15","status":"Completed","delayDays":77},{"id":"m3","name":"Civil Works Award","plannedDate":"2025-03-31","status":"At Risk"},{"id":"m4","name":"Foundation Works 25%","plannedDate":"2026-06-30","status":"At Risk"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-28T00:00:00Z'::timestamptz,
    'PRJ-002:2026-04',
    '{"projectId":"PRJ-002","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-003', '2026-04-01'::date,
    32500, 34800, 28600,
    88, 92, 87,
    '2025-12-31'::date, '2026-08-31'::date, 243,
    5, 3,
    1,
    1,
    '[{"id":"m1","name":"Track Laying 60%","plannedDate":"2024-03-31","actualDate":"2024-06-10","status":"Completed","delayDays":71},{"id":"m2","name":"Electrification 50%","plannedDate":"2024-09-30","actualDate":"2024-12-20","status":"Completed","delayDays":81},{"id":"m3","name":"Track Laying 90%","plannedDate":"2025-06-30","actualDate":"2025-11-15","status":"Completed","delayDays":138},{"id":"m4","name":"System Commissioning","plannedDate":"2025-12-31","status":"Delayed","delayDays":90},{"id":"m5","name":"Revenue Operations","plannedDate":"2026-06-30","status":"At Risk"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-30T00:00:00Z'::timestamptz,
    'PRJ-003:2026-04',
    '{"projectId":"PRJ-003","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-004', '2026-04-01'::date,
    48200, 51800, 22400,
    52, 58, 46,
    '2026-06-30'::date, '2026-12-31'::date, 184,
    5, 2,
    2,
    1,
    '[{"id":"m1","name":"Land Acquisition Complete","plannedDate":"2024-03-31","actualDate":"2024-07-20","status":"Completed","delayDays":111},{"id":"m2","name":"Earthwork 50%","plannedDate":"2024-12-31","actualDate":"2025-03-15","status":"Completed","delayDays":74},{"id":"m3","name":"Bridge Construction 60%","plannedDate":"2025-06-30","status":"Delayed","delayDays":45},{"id":"m4","name":"Pavement Laying Start","plannedDate":"2025-09-30","status":"Delayed","delayDays":60},{"id":"m5","name":"Toll Plaza Construction","plannedDate":"2026-03-31","status":"At Risk"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-29T00:00:00Z'::timestamptz,
    'PRJ-004:2026-04',
    '{"projectId":"PRJ-004","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-005', '2026-04-01'::date,
    12000, 13800, 9800,
    78, 85, 81,
    '2024-12-31'::date, '2026-06-30'::date, 547,
    5, 2,
    2,
    1,
    '[{"id":"m1","name":"Widening Yamunotri Segment","plannedDate":"2023-06-30","actualDate":"2023-10-20","status":"Completed","delayDays":112},{"id":"m2","name":"Tunnel Works 50%","plannedDate":"2024-03-31","actualDate":"2024-11-15","status":"Completed","delayDays":229},{"id":"m3","name":"Gangotri Segment Complete","plannedDate":"2024-09-30","status":"Delayed","delayDays":150},{"id":"m4","name":"Kedarnath Section Complete","plannedDate":"2025-06-30","status":"Delayed","delayDays":90},{"id":"m5","name":"Badrinath Section Complete","plannedDate":"2025-12-31","status":"At Risk"}]'::jsonb, 'active',
    array['Seasonal Risk — Construction Window Narrowing']::text[], '2026-04-25T00:00:00Z'::timestamptz,
    'PRJ-005:2026-04',
    '{"projectId":"PRJ-005","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-006', '2026-04-01'::date,
    26400, 27100, 8200,
    32, 30, 31,
    '2027-12-31'::date, '2028-03-31'::date, 91,
    4, 3,
    0,
    0,
    '[{"id":"m1","name":"Environmental Clearance","plannedDate":"2024-06-30","actualDate":"2024-08-10","status":"Completed","delayDays":41},{"id":"m2","name":"Land Acquisition 50%","plannedDate":"2025-03-31","actualDate":"2025-04-20","status":"Completed","delayDays":20},{"id":"m3","name":"Civil Works Commence","plannedDate":"2025-09-30","actualDate":"2025-10-15","status":"Completed","delayDays":15},{"id":"m4","name":"Earthwork 30%","plannedDate":"2026-03-31","status":"On Track"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-28T00:00:00Z'::timestamptz,
    'PRJ-006:2026-04',
    '{"projectId":"PRJ-006","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-007', '2026-04-01'::date,
    39400, 45800, 12600,
    28, 38, 31,
    '2027-06-30'::date, '2028-12-31'::date, 549,
    4, 1,
    1,
    2,
    '[{"id":"m1","name":"First Concrete Pour U5","plannedDate":"2023-12-31","actualDate":"2024-04-15","status":"Completed","delayDays":106},{"id":"m2","name":"Reactor Building 25%","plannedDate":"2025-06-30","status":"Delayed","delayDays":120},{"id":"m3","name":"Turbine Island Foundation","plannedDate":"2025-12-31","status":"At Risk"},{"id":"m4","name":"Dome Placement U5","plannedDate":"2026-09-30","status":"At Risk"}]'::jsonb, 'active',
    array['Progress Variance Approaching Threshold']::text[], '2026-04-30T00:00:00Z'::timestamptz,
    'PRJ-007:2026-04',
    '{"projectId":"PRJ-007","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-008', '2026-04-01'::date,
    18600, 19200, 11800,
    62, 65, 63,
    '2026-09-30'::date, '2026-12-31'::date, 92,
    5, 3,
    1,
    0,
    '[{"id":"m1","name":"Land Allotment","plannedDate":"2024-03-31","actualDate":"2024-05-10","status":"Completed","delayDays":40},{"id":"m2","name":"Module Procurement","plannedDate":"2024-09-30","actualDate":"2024-11-20","status":"Completed","delayDays":51},{"id":"m3","name":"2 GW Commissioned","plannedDate":"2025-06-30","actualDate":"2025-09-15","status":"Completed","delayDays":77},{"id":"m4","name":"5 GW Commissioned","plannedDate":"2025-12-31","status":"Delayed","delayDays":60},{"id":"m5","name":"10 GW Full Commissioning","plannedDate":"2026-09-30","status":"On Track"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-29T00:00:00Z'::timestamptz,
    'PRJ-008:2026-04',
    '{"projectId":"PRJ-008","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-009', '2026-04-01'::date,
    14200, 15600, 6800,
    47, 55, 47,
    '2026-03-31'::date, '2027-03-31'::date, 365,
    4, 1,
    1,
    2,
    '[{"id":"m1","name":"Boiler Erection Start","plannedDate":"2024-06-30","actualDate":"2024-10-10","status":"Completed","delayDays":102},{"id":"m2","name":"Turbine Pedestal Complete","plannedDate":"2025-03-31","status":"Delayed","delayDays":90},{"id":"m3","name":"Boiler Hydro Test","plannedDate":"2025-09-30","status":"At Risk"},{"id":"m4","name":"First Fire","plannedDate":"2026-03-31","status":"At Risk"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-28T00:00:00Z'::timestamptz,
    'PRJ-009:2026-04',
    '{"projectId":"PRJ-009","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-010', '2026-04-01'::date,
    44605, 48900, 8400,
    14, 22, 18,
    '2028-03-31'::date, '2030-03-31'::date, 731,
    4, 2,
    1,
    1,
    '[{"id":"m1","name":"DPR Approval","plannedDate":"2022-12-31","actualDate":"2023-03-20","status":"Completed","delayDays":79},{"id":"m2","name":"Land Acquisition 20%","plannedDate":"2024-06-30","actualDate":"2025-01-10","status":"Completed","delayDays":194},{"id":"m3","name":"Dam Foundation Works","plannedDate":"2025-03-31","status":"Delayed","delayDays":180},{"id":"m4","name":"Canal Alignment Finalization","plannedDate":"2025-12-31","status":"At Risk"}]'::jsonb, 'active',
    array['Physical Progress Significantly Below Expected Trajectory']::text[], '2026-04-27T00:00:00Z'::timestamptz,
    'PRJ-010:2026-04',
    '{"projectId":"PRJ-010","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-011', '2026-04-01'::date,
    28600, 29400, 19800,
    71, 74, 69,
    '2026-03-31'::date, '2026-09-30'::date, 183,
    4, 2,
    1,
    1,
    '[{"id":"m1","name":"25% HH Connections","plannedDate":"2024-03-31","actualDate":"2024-05-15","status":"Completed","delayDays":45},{"id":"m2","name":"50% HH Connections","plannedDate":"2024-12-31","actualDate":"2025-03-20","status":"Completed","delayDays":79},{"id":"m3","name":"75% HH Connections","plannedDate":"2025-09-30","status":"Delayed","delayDays":60},{"id":"m4","name":"100% HH Connections","plannedDate":"2026-03-31","status":"At Risk"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-29T00:00:00Z'::timestamptz,
    'PRJ-011:2026-04',
    '{"projectId":"PRJ-011","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-012', '2026-04-01'::date,
    22400, 24100, 7600,
    31, 45, 33,
    '2026-12-31'::date, '2027-09-30'::date, 273,
    4, 1,
    1,
    2,
    '[{"id":"m1","name":"OFC Procurement Complete","plannedDate":"2024-06-30","actualDate":"2024-09-20","status":"Completed","delayDays":82},{"id":"m2","name":"5000 GP Connected","plannedDate":"2025-03-31","status":"Delayed","delayDays":90},{"id":"m3","name":"15000 GP Connected","plannedDate":"2025-12-31","status":"At Risk"},{"id":"m4","name":"30000 GP Connected","plannedDate":"2026-12-31","status":"At Risk"}]'::jsonb, 'active',
    array['Implementation Pace Below Contracted Milestone']::text[], '2026-04-28T00:00:00Z'::timestamptz,
    'PRJ-012:2026-04',
    '{"projectId":"PRJ-012","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-013', '2026-04-01'::date,
    4800, 5100, 3200,
    68, 70, 66,
    '2026-06-30'::date, '2026-09-30'::date, 92,
    3, 1,
    0,
    0,
    '[{"id":"m1","name":"1 Lakh Hotspots","plannedDate":"2025-03-31","actualDate":"2025-04-20","status":"Completed","delayDays":20},{"id":"m2","name":"3 Lakh Hotspots","plannedDate":"2025-12-31","status":"On Track"},{"id":"m3","name":"5 Lakh Hotspots","plannedDate":"2026-06-30","status":"On Track"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-30T00:00:00Z'::timestamptz,
    'PRJ-013:2026-04',
    '{"projectId":"PRJ-013","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-014', '2026-04-01'::date,
    7200, 8100, 4800,
    62, 72, 66,
    '2025-12-31'::date, '2026-09-30'::date, 273,
    4, 1,
    1,
    2,
    '[{"id":"m1","name":"Academic Block Structural","plannedDate":"2024-06-30","actualDate":"2024-10-15","status":"Completed","delayDays":107},{"id":"m2","name":"Hospital Block Structural","plannedDate":"2025-03-31","status":"Delayed","delayDays":90},{"id":"m3","name":"MEP Works Completion","plannedDate":"2025-09-30","status":"At Risk"},{"id":"m4","name":"Commissioning","plannedDate":"2025-12-31","status":"At Risk"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-26T00:00:00Z'::timestamptz,
    'PRJ-014:2026-04',
    '{"projectId":"PRJ-014","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-015', '2026-04-01'::date,
    3200, 3950, 2100,
    56, 68, 65,
    '2025-03-31'::date, '2026-12-31'::date, 641,
    4, 1,
    2,
    1,
    '[{"id":"m1","name":"Academic Complex Phase 1","plannedDate":"2023-12-31","actualDate":"2024-08-10","status":"Completed","delayDays":222},{"id":"m2","name":"Residential Complex","plannedDate":"2024-06-30","status":"Delayed","delayDays":180},{"id":"m3","name":"Library & Admin Block","plannedDate":"2024-12-31","status":"Delayed","delayDays":150},{"id":"m4","name":"Sports & Recreation","plannedDate":"2025-03-31","status":"At Risk"}]'::jsonb, 'active',
    array['Cost Escalation and Significant Progress Deficit']::text[], '2026-04-25T00:00:00Z'::timestamptz,
    'PRJ-015:2026-04',
    '{"projectId":"PRJ-015","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-016', '2026-04-01'::date,
    9800, 10600, 5200,
    55, 60, 53,
    '2026-06-30'::date, '2026-12-31'::date, 184,
    4, 2,
    1,
    1,
    '[{"id":"m1","name":"Forest Clearance","plannedDate":"2023-12-31","actualDate":"2024-04-20","status":"Completed","delayDays":111},{"id":"m2","name":"Overburden Removal 30%","plannedDate":"2025-06-30","actualDate":"2025-09-10","status":"Completed","delayDays":72},{"id":"m3","name":"First Coal Production","plannedDate":"2025-12-31","status":"Delayed","delayDays":60},{"id":"m4","name":"Target Production 15 MTPA","plannedDate":"2026-06-30","status":"At Risk"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-28T00:00:00Z'::timestamptz,
    'PRJ-016:2026-04',
    '{"projectId":"PRJ-016","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-017', '2026-04-01'::date,
    23600, 26800, 18900,
    74, 78, 80,
    '2026-03-31'::date, '2026-09-30'::date, 183,
    4, 1,
    1,
    2,
    '[{"id":"m1","name":"Blast Furnace 3 Commission","plannedDate":"2025-03-31","actualDate":"2025-06-10","status":"Completed","delayDays":71},{"id":"m2","name":"Hot Strip Mill Erection","plannedDate":"2025-09-30","status":"Delayed","delayDays":45},{"id":"m3","name":"Cold Rolling Mill","plannedDate":"2026-03-31","status":"At Risk"},{"id":"m4","name":"Full Capacity Commissioning","plannedDate":"2026-06-30","status":"At Risk"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-27T00:00:00Z'::timestamptz,
    'PRJ-017:2026-04',
    '{"projectId":"PRJ-017","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-018', '2026-04-01'::date,
    31200, 33400, 9800,
    30, 35, 31,
    '2028-03-31'::date, '2028-09-30'::date, 183,
    3, 1,
    0,
    0,
    '[{"id":"m1","name":"Piling Works 50%","plannedDate":"2025-06-30","actualDate":"2025-09-15","status":"Completed","delayDays":77},{"id":"m2","name":"Viaduct 20%","plannedDate":"2025-12-31","status":"On Track"},{"id":"m3","name":"Viaduct 50%","plannedDate":"2026-09-30","status":"On Track"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-29T00:00:00Z'::timestamptz,
    'PRJ-018:2026-04',
    '{"projectId":"PRJ-018","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-019', '2026-04-01'::date,
    61843, 67200, 18500,
    27, 32, 29,
    '2028-12-31'::date, '2029-06-30'::date, 181,
    4, 2,
    0,
    0,
    '[{"id":"m1","name":"Civil Package Award","plannedDate":"2024-09-30","actualDate":"2024-11-20","status":"Completed","delayDays":51},{"id":"m2","name":"Piling Works Start","plannedDate":"2025-03-31","actualDate":"2025-05-10","status":"Completed","delayDays":40},{"id":"m3","name":"Underground Section 20%","plannedDate":"2026-03-31","status":"On Track"},{"id":"m4","name":"Elevated Section 30%","plannedDate":"2026-09-30","status":"On Track"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-26T00:00:00Z'::timestamptz,
    'PRJ-019:2026-04',
    '{"projectId":"PRJ-019","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-020', '2026-04-01'::date,
    8379, 9100, 6200,
    72, 75, 74,
    '2026-03-31'::date, '2026-09-30'::date, 183,
    4, 1,
    1,
    2,
    '[{"id":"m1","name":"Underground Section Complete","plannedDate":"2025-06-30","actualDate":"2025-09-20","status":"Completed","delayDays":82},{"id":"m2","name":"Systems & OHE","plannedDate":"2025-12-31","status":"Delayed","delayDays":45},{"id":"m3","name":"Trial Runs","plannedDate":"2026-03-31","status":"At Risk"},{"id":"m4","name":"Commercial Operations","plannedDate":"2026-06-30","status":"At Risk"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-27T00:00:00Z'::timestamptz,
    'PRJ-020:2026-04',
    '{"projectId":"PRJ-020","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-021', '2026-04-01'::date,
    76220, 82400, 12400,
    14, 18, 16,
    '2030-03-31'::date, '2031-03-31'::date, 365,
    3, 1,
    1,
    1,
    '[{"id":"m1","name":"Environmental Clearance","plannedDate":"2024-03-31","actualDate":"2024-09-10","status":"Completed","delayDays":163},{"id":"m2","name":"Dredging Contract Award","plannedDate":"2025-06-30","status":"Delayed","delayDays":90},{"id":"m3","name":"Breakwater Phase 1","plannedDate":"2026-06-30","status":"At Risk"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-28T00:00:00Z'::timestamptz,
    'PRJ-021:2026-04',
    '{"projectId":"PRJ-021","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-022', '2026-04-01'::date,
    6809, 8100, 4600,
    64, 72, 67,
    '2026-09-30'::date, '2027-06-30'::date, 273,
    4, 1,
    1,
    2,
    '[{"id":"m1","name":"TBM Breakthrough Main Bore","plannedDate":"2025-03-31","actualDate":"2025-07-20","status":"Completed","delayDays":111},{"id":"m2","name":"Escape Tunnel Complete","plannedDate":"2025-09-30","status":"Delayed","delayDays":60},{"id":"m3","name":"MEP & Safety Systems","plannedDate":"2026-03-31","status":"At Risk"},{"id":"m4","name":"Trial Run","plannedDate":"2026-09-30","status":"At Risk"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-28T00:00:00Z'::timestamptz,
    'PRJ-022:2026-04',
    '{"projectId":"PRJ-022","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-023', '2026-04-01'::date,
    16216, 20500, 7200,
    42, 55, 44,
    '2024-12-31'::date, '2027-12-31'::date, 1095,
    5, 2,
    2,
    1,
    '[{"id":"m1","name":"Tunnel T-3 Breakthrough","plannedDate":"2023-03-31","actualDate":"2024-01-15","status":"Completed","delayDays":290},{"id":"m2","name":"Tunnel T-7 Start","plannedDate":"2023-12-31","actualDate":"2024-10-20","status":"Completed","delayDays":294},{"id":"m3","name":"50% Tunneling Complete","plannedDate":"2024-12-31","status":"Delayed","delayDays":300},{"id":"m4","name":"Bridge Works 60%","plannedDate":"2025-12-31","status":"Delayed","delayDays":200},{"id":"m5","name":"Track Laying Start","plannedDate":"2026-12-31","status":"At Risk"}]'::jsonb, 'active',
    array['Milestone Completion Significantly Behind Planned Progress']::text[], '2026-04-26T00:00:00Z'::timestamptz,
    'PRJ-023:2026-04',
    '{"projectId":"PRJ-023","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-024', '2026-04-01'::date,
    55548, 71000, 32000,
    52, 72, 57,
    '2022-12-31'::date, '2027-03-31'::date, 1552,
    5, 2,
    2,
    1,
    '[{"id":"m1","name":"Cofferdam Completion","plannedDate":"2021-03-31","actualDate":"2022-11-10","status":"Completed","delayDays":589},{"id":"m2","name":"Spillway Gates 50%","plannedDate":"2023-06-30","actualDate":"2025-01-20","status":"Completed","delayDays":569},{"id":"m3","name":"Earth Dam Completion","plannedDate":"2024-03-31","status":"Delayed","delayDays":400},{"id":"m4","name":"Powerhouse Installation","plannedDate":"2025-12-31","status":"Delayed","delayDays":300},{"id":"m5","name":"First Power Generation","plannedDate":"2026-12-31","status":"At Risk"}]'::jsonb, 'active',
    array['Schedule Delay Exceeds 1,500 Days']::text[], '2026-04-29T00:00:00Z'::timestamptz,
    'PRJ-024:2026-04',
    '{"projectId":"PRJ-024","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-025', '2026-04-01'::date,
    16700, 18200, 11800,
    68, 75, 70,
    '2025-12-31'::date, '2026-12-31'::date, 365,
    5, 2,
    1,
    2,
    '[{"id":"m1","name":"Land Levelling Complete","plannedDate":"2024-03-31","actualDate":"2024-06-20","status":"Completed","delayDays":81},{"id":"m2","name":"Runway Pavement 60%","plannedDate":"2024-12-31","actualDate":"2025-04-10","status":"Completed","delayDays":100},{"id":"m3","name":"Terminal Building Structural","plannedDate":"2025-09-30","status":"Delayed","delayDays":90},{"id":"m4","name":"ATM & Navigation Systems","plannedDate":"2026-06-30","status":"At Risk"},{"id":"m5","name":"Commissioning & Trial Flights","plannedDate":"2026-12-31","status":"At Risk"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-30T00:00:00Z'::timestamptz,
    'PRJ-025:2026-04',
    '{"projectId":"PRJ-025","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-026', '2026-04-01'::date,
    29560, 31400, 9200,
    31, 38, 31,
    '2024-09-30'::date, '2027-03-31'::date, 913,
    5, 2,
    2,
    1,
    '[{"id":"m1","name":"Land Acquisition 100%","plannedDate":"2023-03-31","actualDate":"2023-09-20","status":"Completed","delayDays":173},{"id":"m2","name":"Runway 1 Earthwork","plannedDate":"2024-03-31","actualDate":"2025-01-10","status":"Completed","delayDays":285},{"id":"m3","name":"Terminal Piling","plannedDate":"2025-06-30","status":"Delayed","delayDays":120},{"id":"m4","name":"Runway Pavement Start","plannedDate":"2026-03-31","status":"Delayed","delayDays":90},{"id":"m5","name":"Terminal Structure","plannedDate":"2026-12-31","status":"At Risk"}]'::jsonb, 'active',
    array['Schedule Reset for Third Time']::text[], '2026-04-28T00:00:00Z'::timestamptz,
    'PRJ-026:2026-04',
    '{"projectId":"PRJ-026","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-027', '2026-04-01'::date,
    687, 825, 825,
    100, 100, 100,
    '2023-12-31'::date, '2024-02-28'::date, 59,
    3, 3,
    0,
    0,
    '[{"id":"m1","name":"Breakthrough","plannedDate":"2022-12-31","actualDate":"2023-02-10","status":"Completed","delayDays":41},{"id":"m2","name":"Civil Finishing","plannedDate":"2023-09-30","actualDate":"2023-12-20","status":"Completed","delayDays":81},{"id":"m3","name":"Inauguration","plannedDate":"2023-12-31","actualDate":"2024-02-28","status":"Completed","delayDays":59}]'::jsonb, 'completed',
    '{}'::text[], '2026-04-01T00:00:00Z'::timestamptz,
    'PRJ-027:2026-04',
    '{"projectId":"PRJ-027","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-028', '2026-04-01'::date,
    34100, 36500, 14200,
    40, 45, 41,
    '2027-03-31'::date, '2027-09-30'::date, 183,
    3, 1,
    0,
    0,
    '[{"id":"m1","name":"Site Preparation","plannedDate":"2025-03-31","actualDate":"2025-05-20","status":"Completed","delayDays":50},{"id":"m2","name":"Crude Distillation Unit Foundation","plannedDate":"2025-12-31","status":"On Track"},{"id":"m3","name":"CDU Structural Steel","plannedDate":"2026-09-30","status":"On Track"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-29T00:00:00Z'::timestamptz,
    'PRJ-028:2026-04',
    '{"projectId":"PRJ-028","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-029', '2026-04-01'::date,
    17800, 18400, 12600,
    70, 72, 70,
    '2026-09-30'::date, '2026-12-31'::date, 92,
    4, 2,
    0,
    0,
    '[{"id":"m1","name":"Land Acquisition 100%","plannedDate":"2024-06-30","actualDate":"2024-08-10","status":"Completed","delayDays":41},{"id":"m2","name":"Pavement 50%","plannedDate":"2025-06-30","actualDate":"2025-09-20","status":"Completed","delayDays":82},{"id":"m3","name":"Pavement 80%","plannedDate":"2026-03-31","status":"On Track"},{"id":"m4","name":"Structures Complete","plannedDate":"2026-06-30","status":"On Track"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-30T00:00:00Z'::timestamptz,
    'PRJ-029:2026-04',
    '{"projectId":"PRJ-029","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-030', '2026-04-01'::date,
    8200, 8800, 6100,
    75, 80, 74,
    '2025-12-31'::date, '2026-09-30'::date, 273,
    3, 1,
    1,
    1,
    '[{"id":"m1","name":"10000 Village Electrification","plannedDate":"2024-06-30","actualDate":"2024-09-10","status":"Completed","delayDays":72},{"id":"m2","name":"Distribution Lines 70%","plannedDate":"2025-06-30","status":"Delayed","delayDays":90},{"id":"m3","name":"Transformers Installation 80%","plannedDate":"2025-12-31","status":"At Risk"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-27T00:00:00Z'::timestamptz,
    'PRJ-030:2026-04',
    '{"projectId":"PRJ-030","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-031', '2026-04-01'::date,
    5600, 5900, 3800,
    65, 68, 67,
    '2026-06-30'::date, '2026-09-30'::date, 92,
    3, 1,
    0,
    0,
    '[{"id":"m1","name":"Rail Link Foundation","plannedDate":"2025-03-31","actualDate":"2025-05-10","status":"Completed","delayDays":40},{"id":"m2","name":"Road Approach Works","plannedDate":"2025-09-30","status":"On Track"},{"id":"m3","name":"Railway Siding","plannedDate":"2026-03-31","status":"On Track"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-28T00:00:00Z'::timestamptz,
    'PRJ-031:2026-04',
    '{"projectId":"PRJ-031","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-032', '2026-04-01'::date,
    2900, 3100, 1400,
    48, 52, 48,
    '2026-12-31'::date, '2027-06-30'::date, 181,
    3, 1,
    0,
    0,
    '[{"id":"m1","name":"Jetty Construction","plannedDate":"2025-06-30","actualDate":"2025-09-15","status":"Completed","delayDays":77},{"id":"m2","name":"Warehouse Block A","plannedDate":"2025-12-31","status":"On Track"},{"id":"m3","name":"Rail Siding Connection","plannedDate":"2026-06-30","status":"On Track"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-29T00:00:00Z'::timestamptz,
    'PRJ-032:2026-04',
    '{"projectId":"PRJ-032","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-033', '2026-04-01'::date,
    5796, 8200, 2100,
    28, 42, 36,
    '2025-06-30'::date, '2029-03-31'::date, 1370,
    3, 1,
    1,
    1,
    '[{"id":"m1","name":"Diversion Tunnel","plannedDate":"2022-12-31","actualDate":"2024-03-20","status":"Completed","delayDays":445},{"id":"m2","name":"Dam Foundation","plannedDate":"2024-12-31","status":"Delayed","delayDays":300},{"id":"m3","name":"Main Dam Body 25%","plannedDate":"2026-06-30","status":"At Risk"}]'::jsonb, 'active',
    array['Expenditure-Progress Mismatch Detected']::text[], '2026-04-26T00:00:00Z'::timestamptz,
    'PRJ-033:2026-04',
    '{"projectId":"PRJ-033","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-034', '2026-04-01'::date,
    4200, 4450, 1800,
    38, 40, 42,
    '2027-03-31'::date, '2027-09-30'::date, 183,
    3, 1,
    0,
    0,
    '[{"id":"m1","name":"Master Plan Approval","plannedDate":"2024-12-31","actualDate":"2025-01-20","status":"Completed","delayDays":20},{"id":"m2","name":"Infrastructure Works Start","plannedDate":"2025-09-30","status":"On Track"},{"id":"m3","name":"Phase 1 Plots Ready","plannedDate":"2026-09-30","status":"On Track"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-27T00:00:00Z'::timestamptz,
    'PRJ-034:2026-04',
    '{"projectId":"PRJ-034","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-035', '2026-04-01'::date,
    36230, 38500, 28000,
    82, 86, 77,
    '2025-12-31'::date, '2026-09-30'::date, 273,
    5, 2,
    2,
    1,
    '[{"id":"m1","name":"Pavement 50%","plannedDate":"2024-06-30","actualDate":"2024-09-10","status":"Completed","delayDays":72},{"id":"m2","name":"Structures 90%","plannedDate":"2024-12-31","actualDate":"2025-03-20","status":"Completed","delayDays":79},{"id":"m3","name":"Pavement 90%","plannedDate":"2025-06-30","status":"Delayed","delayDays":60},{"id":"m4","name":"Toll Plazas Complete","plannedDate":"2025-09-30","status":"Delayed","delayDays":45},{"id":"m5","name":"Inauguration","plannedDate":"2025-12-31","status":"At Risk"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-30T00:00:00Z'::timestamptz,
    'PRJ-035:2026-04',
    '{"projectId":"PRJ-035","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-036', '2026-04-01'::date,
    4026, 4100, 3600,
    88, 90, 87,
    '2025-12-31'::date, '2026-06-30'::date, 181,
    3, 1,
    1,
    1,
    '[{"id":"m1","name":"Academic Complex Handover","plannedDate":"2025-03-31","actualDate":"2025-06-10","status":"Completed","delayDays":71},{"id":"m2","name":"OPD Block Completion","plannedDate":"2025-09-30","status":"Delayed","delayDays":30},{"id":"m3","name":"Hospital Block Commissioning","plannedDate":"2025-12-31","status":"At Risk"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-30T00:00:00Z'::timestamptz,
    'PRJ-036:2026-04',
    '{"projectId":"PRJ-036","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-037', '2026-04-01'::date,
    6200, 6800, 5100,
    82, 85, 82,
    '2025-06-30'::date, '2026-03-31'::date, 274,
    4, 2,
    1,
    1,
    '[{"id":"m1","name":"Pipeline Laying 60%","plannedDate":"2024-06-30","actualDate":"2024-09-15","status":"Completed","delayDays":77},{"id":"m2","name":"Pipeline Laying 90%","plannedDate":"2024-12-31","actualDate":"2025-04-10","status":"Completed","delayDays":100},{"id":"m3","name":"Hydrotesting","plannedDate":"2025-06-30","status":"Delayed","delayDays":60},{"id":"m4","name":"Commissioning","plannedDate":"2025-12-31","status":"At Risk"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-28T00:00:00Z'::timestamptz,
    'PRJ-037:2026-04',
    '{"projectId":"PRJ-037","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-038', '2026-04-01'::date,
    91000, 93000, 21000,
    22, 24, 23,
    '2026-12-31'::date, '2027-06-30'::date, 181,
    3, 1,
    0,
    0,
    '[{"id":"m1","name":"Site Preparation","plannedDate":"2025-06-30","actualDate":"2025-07-20","status":"Completed","delayDays":20},{"id":"m2","name":"Civil Construction Phase 1","plannedDate":"2025-12-31","status":"On Track"},{"id":"m3","name":"Cleanroom Construction","plannedDate":"2026-06-30","status":"On Track"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-29T00:00:00Z'::timestamptz,
    'PRJ-038:2026-04',
    '{"projectId":"PRJ-038","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-039', '2026-04-01'::date,
    7200, 7500, 6800,
    94, 96, 94,
    '2025-12-31'::date, '2026-06-30'::date, 181,
    3, 1,
    1,
    1,
    '[{"id":"m1","name":"Unit 1 Commissioning","plannedDate":"2025-03-31","actualDate":"2025-06-20","status":"Completed","delayDays":81},{"id":"m2","name":"Unit 2 Commissioning","plannedDate":"2025-09-30","status":"Delayed","delayDays":45},{"id":"m3","name":"Full Capacity Operation","plannedDate":"2025-12-31","status":"At Risk"}]'::jsonb, 'active',
    '{}'::text[], '2026-04-30T00:00:00Z'::timestamptz,
    'PRJ-039:2026-04',
    '{"projectId":"PRJ-039","reportingMonth":"2026-04-01"}'::jsonb
  ),
  (
    'PRJ-040', '2026-04-01'::date,
    4200, 5100, 2800,
    54, 65, 66,
    '2025-12-31'::date, '2027-06-30'::date, 547,
    4, 1,
    2,
    1,
    '[{"id":"m1","name":"Portal Civil Works","plannedDate":"2024-03-31","actualDate":"2024-08-10","status":"Completed","delayDays":132},{"id":"m2","name":"Tunnel Boring 40%","plannedDate":"2025-03-31","status":"Delayed","delayDays":150},{"id":"m3","name":"Tunnel Boring Complete","plannedDate":"2025-12-31","status":"Delayed","delayDays":180},{"id":"m4","name":"Civil Fit-out","plannedDate":"2026-09-30","status":"At Risk"}]'::jsonb, 'active',
    array['Cost Escalation and Schedule Delay — Dual Risk']::text[], '2026-04-27T00:00:00Z'::timestamptz,
    'PRJ-040:2026-04',
    '{"projectId":"PRJ-040","reportingMonth":"2026-04-01"}'::jsonb
  )
) as values_table(
  project_code, reporting_month, approved_cost, revised_cost, expenditure,
  physical_progress, planned_progress, financial_progress, original_completion_date,
  revised_completion_date, delay_days, milestones_total, milestones_completed,
  milestones_delayed, milestones_at_risk, milestone_snapshot, contract_status,
  issues, submitted_at, source_record_id, raw_payload
)
join public.projects on projects.project_code = values_table.project_code
on conflict (project_id, reporting_month, source_system) do update set
  approved_cost = excluded.approved_cost,
  revised_cost = excluded.revised_cost,
  expenditure = excluded.expenditure,
  physical_progress = excluded.physical_progress,
  planned_progress = excluded.planned_progress,
  financial_progress = excluded.financial_progress,
  revised_completion_date = excluded.revised_completion_date,
  forecast_completion_date = excluded.forecast_completion_date,
  delay_days = excluded.delay_days,
  milestone_snapshot = excluded.milestone_snapshot,
  issues = excluded.issues,
  submitted_at = excluded.submitted_at,
  raw_payload = excluded.raw_payload;

insert into public.milestones (
  project_id, milestone_code, name, sequence_no, planned_date, actual_date,
  status, delay_days, source_update_id, source_record_id, metadata
)
select
  projects.id,
  values_table.milestone_code,
  values_table.name,
  values_table.sequence_no,
  values_table.planned_date,
  values_table.actual_date,
  values_table.status::public.milestone_status,
  values_table.delay_days,
  monthly_updates.id,
  values_table.source_record_id,
  '{"seed":true,"synthetic":true}'::jsonb
from (values
  (
    'PRJ-001', 'm1', 'Land Acquisition Phase 1', 1,
    '2022-06-30'::date, '2023-02-15'::date,
    'completed', 230,
    'PRJ-001:m1'
  ),
  (
    'PRJ-001', 'm2', 'Viaduct Construction Begin', 2,
    '2023-03-31'::date, '2023-11-10'::date,
    'completed', 224,
    'PRJ-001:m2'
  ),
  (
    'PRJ-001', 'm3', 'Tunnel Boring Completion', 3,
    '2024-09-30'::date, null,
    'delayed', 180,
    'PRJ-001:m3'
  ),
  (
    'PRJ-001', 'm4', '50% Viaduct Completion', 4,
    '2025-03-31'::date, null,
    'delayed', 210,
    'PRJ-001:m4'
  ),
  (
    'PRJ-001', 'm5', 'Track Laying Commencement', 5,
    '2025-12-31'::date, null,
    'at_risk', null,
    'PRJ-001:m5'
  ),
  (
    'PRJ-001', 'm6', 'Systems Integration', 6,
    '2026-06-30'::date, null,
    'at_risk', null,
    'PRJ-001:m6'
  ),
  (
    'PRJ-002', 'm1', 'DPR Finalisation', 1,
    '2023-12-31'::date, '2024-03-20'::date,
    'completed', 80,
    'PRJ-002:m1'
  ),
  (
    'PRJ-002', 'm2', 'Land Acquisition Start', 2,
    '2024-06-30'::date, '2024-09-15'::date,
    'completed', 77,
    'PRJ-002:m2'
  ),
  (
    'PRJ-002', 'm3', 'Civil Works Award', 3,
    '2025-03-31'::date, null,
    'at_risk', null,
    'PRJ-002:m3'
  ),
  (
    'PRJ-002', 'm4', 'Foundation Works 25%', 4,
    '2026-06-30'::date, null,
    'at_risk', null,
    'PRJ-002:m4'
  ),
  (
    'PRJ-003', 'm1', 'Track Laying 60%', 1,
    '2024-03-31'::date, '2024-06-10'::date,
    'completed', 71,
    'PRJ-003:m1'
  ),
  (
    'PRJ-003', 'm2', 'Electrification 50%', 2,
    '2024-09-30'::date, '2024-12-20'::date,
    'completed', 81,
    'PRJ-003:m2'
  ),
  (
    'PRJ-003', 'm3', 'Track Laying 90%', 3,
    '2025-06-30'::date, '2025-11-15'::date,
    'completed', 138,
    'PRJ-003:m3'
  ),
  (
    'PRJ-003', 'm4', 'System Commissioning', 4,
    '2025-12-31'::date, null,
    'delayed', 90,
    'PRJ-003:m4'
  ),
  (
    'PRJ-003', 'm5', 'Revenue Operations', 5,
    '2026-06-30'::date, null,
    'at_risk', null,
    'PRJ-003:m5'
  ),
  (
    'PRJ-004', 'm1', 'Land Acquisition Complete', 1,
    '2024-03-31'::date, '2024-07-20'::date,
    'completed', 111,
    'PRJ-004:m1'
  ),
  (
    'PRJ-004', 'm2', 'Earthwork 50%', 2,
    '2024-12-31'::date, '2025-03-15'::date,
    'completed', 74,
    'PRJ-004:m2'
  ),
  (
    'PRJ-004', 'm3', 'Bridge Construction 60%', 3,
    '2025-06-30'::date, null,
    'delayed', 45,
    'PRJ-004:m3'
  ),
  (
    'PRJ-004', 'm4', 'Pavement Laying Start', 4,
    '2025-09-30'::date, null,
    'delayed', 60,
    'PRJ-004:m4'
  ),
  (
    'PRJ-004', 'm5', 'Toll Plaza Construction', 5,
    '2026-03-31'::date, null,
    'at_risk', null,
    'PRJ-004:m5'
  ),
  (
    'PRJ-005', 'm1', 'Widening Yamunotri Segment', 1,
    '2023-06-30'::date, '2023-10-20'::date,
    'completed', 112,
    'PRJ-005:m1'
  ),
  (
    'PRJ-005', 'm2', 'Tunnel Works 50%', 2,
    '2024-03-31'::date, '2024-11-15'::date,
    'completed', 229,
    'PRJ-005:m2'
  ),
  (
    'PRJ-005', 'm3', 'Gangotri Segment Complete', 3,
    '2024-09-30'::date, null,
    'delayed', 150,
    'PRJ-005:m3'
  ),
  (
    'PRJ-005', 'm4', 'Kedarnath Section Complete', 4,
    '2025-06-30'::date, null,
    'delayed', 90,
    'PRJ-005:m4'
  ),
  (
    'PRJ-005', 'm5', 'Badrinath Section Complete', 5,
    '2025-12-31'::date, null,
    'at_risk', null,
    'PRJ-005:m5'
  ),
  (
    'PRJ-006', 'm1', 'Environmental Clearance', 1,
    '2024-06-30'::date, '2024-08-10'::date,
    'completed', 41,
    'PRJ-006:m1'
  ),
  (
    'PRJ-006', 'm2', 'Land Acquisition 50%', 2,
    '2025-03-31'::date, '2025-04-20'::date,
    'completed', 20,
    'PRJ-006:m2'
  ),
  (
    'PRJ-006', 'm3', 'Civil Works Commence', 3,
    '2025-09-30'::date, '2025-10-15'::date,
    'completed', 15,
    'PRJ-006:m3'
  ),
  (
    'PRJ-006', 'm4', 'Earthwork 30%', 4,
    '2026-03-31'::date, null,
    'on_track', null,
    'PRJ-006:m4'
  ),
  (
    'PRJ-007', 'm1', 'First Concrete Pour U5', 1,
    '2023-12-31'::date, '2024-04-15'::date,
    'completed', 106,
    'PRJ-007:m1'
  ),
  (
    'PRJ-007', 'm2', 'Reactor Building 25%', 2,
    '2025-06-30'::date, null,
    'delayed', 120,
    'PRJ-007:m2'
  ),
  (
    'PRJ-007', 'm3', 'Turbine Island Foundation', 3,
    '2025-12-31'::date, null,
    'at_risk', null,
    'PRJ-007:m3'
  ),
  (
    'PRJ-007', 'm4', 'Dome Placement U5', 4,
    '2026-09-30'::date, null,
    'at_risk', null,
    'PRJ-007:m4'
  ),
  (
    'PRJ-008', 'm1', 'Land Allotment', 1,
    '2024-03-31'::date, '2024-05-10'::date,
    'completed', 40,
    'PRJ-008:m1'
  ),
  (
    'PRJ-008', 'm2', 'Module Procurement', 2,
    '2024-09-30'::date, '2024-11-20'::date,
    'completed', 51,
    'PRJ-008:m2'
  ),
  (
    'PRJ-008', 'm3', '2 GW Commissioned', 3,
    '2025-06-30'::date, '2025-09-15'::date,
    'completed', 77,
    'PRJ-008:m3'
  ),
  (
    'PRJ-008', 'm4', '5 GW Commissioned', 4,
    '2025-12-31'::date, null,
    'delayed', 60,
    'PRJ-008:m4'
  ),
  (
    'PRJ-008', 'm5', '10 GW Full Commissioning', 5,
    '2026-09-30'::date, null,
    'on_track', null,
    'PRJ-008:m5'
  ),
  (
    'PRJ-009', 'm1', 'Boiler Erection Start', 1,
    '2024-06-30'::date, '2024-10-10'::date,
    'completed', 102,
    'PRJ-009:m1'
  ),
  (
    'PRJ-009', 'm2', 'Turbine Pedestal Complete', 2,
    '2025-03-31'::date, null,
    'delayed', 90,
    'PRJ-009:m2'
  ),
  (
    'PRJ-009', 'm3', 'Boiler Hydro Test', 3,
    '2025-09-30'::date, null,
    'at_risk', null,
    'PRJ-009:m3'
  ),
  (
    'PRJ-009', 'm4', 'First Fire', 4,
    '2026-03-31'::date, null,
    'at_risk', null,
    'PRJ-009:m4'
  ),
  (
    'PRJ-010', 'm1', 'DPR Approval', 1,
    '2022-12-31'::date, '2023-03-20'::date,
    'completed', 79,
    'PRJ-010:m1'
  ),
  (
    'PRJ-010', 'm2', 'Land Acquisition 20%', 2,
    '2024-06-30'::date, '2025-01-10'::date,
    'completed', 194,
    'PRJ-010:m2'
  ),
  (
    'PRJ-010', 'm3', 'Dam Foundation Works', 3,
    '2025-03-31'::date, null,
    'delayed', 180,
    'PRJ-010:m3'
  ),
  (
    'PRJ-010', 'm4', 'Canal Alignment Finalization', 4,
    '2025-12-31'::date, null,
    'at_risk', null,
    'PRJ-010:m4'
  ),
  (
    'PRJ-011', 'm1', '25% HH Connections', 1,
    '2024-03-31'::date, '2024-05-15'::date,
    'completed', 45,
    'PRJ-011:m1'
  ),
  (
    'PRJ-011', 'm2', '50% HH Connections', 2,
    '2024-12-31'::date, '2025-03-20'::date,
    'completed', 79,
    'PRJ-011:m2'
  ),
  (
    'PRJ-011', 'm3', '75% HH Connections', 3,
    '2025-09-30'::date, null,
    'delayed', 60,
    'PRJ-011:m3'
  ),
  (
    'PRJ-011', 'm4', '100% HH Connections', 4,
    '2026-03-31'::date, null,
    'at_risk', null,
    'PRJ-011:m4'
  ),
  (
    'PRJ-012', 'm1', 'OFC Procurement Complete', 1,
    '2024-06-30'::date, '2024-09-20'::date,
    'completed', 82,
    'PRJ-012:m1'
  ),
  (
    'PRJ-012', 'm2', '5000 GP Connected', 2,
    '2025-03-31'::date, null,
    'delayed', 90,
    'PRJ-012:m2'
  ),
  (
    'PRJ-012', 'm3', '15000 GP Connected', 3,
    '2025-12-31'::date, null,
    'at_risk', null,
    'PRJ-012:m3'
  ),
  (
    'PRJ-012', 'm4', '30000 GP Connected', 4,
    '2026-12-31'::date, null,
    'at_risk', null,
    'PRJ-012:m4'
  ),
  (
    'PRJ-013', 'm1', '1 Lakh Hotspots', 1,
    '2025-03-31'::date, '2025-04-20'::date,
    'completed', 20,
    'PRJ-013:m1'
  ),
  (
    'PRJ-013', 'm2', '3 Lakh Hotspots', 2,
    '2025-12-31'::date, null,
    'on_track', null,
    'PRJ-013:m2'
  ),
  (
    'PRJ-013', 'm3', '5 Lakh Hotspots', 3,
    '2026-06-30'::date, null,
    'on_track', null,
    'PRJ-013:m3'
  ),
  (
    'PRJ-014', 'm1', 'Academic Block Structural', 1,
    '2024-06-30'::date, '2024-10-15'::date,
    'completed', 107,
    'PRJ-014:m1'
  ),
  (
    'PRJ-014', 'm2', 'Hospital Block Structural', 2,
    '2025-03-31'::date, null,
    'delayed', 90,
    'PRJ-014:m2'
  ),
  (
    'PRJ-014', 'm3', 'MEP Works Completion', 3,
    '2025-09-30'::date, null,
    'at_risk', null,
    'PRJ-014:m3'
  ),
  (
    'PRJ-014', 'm4', 'Commissioning', 4,
    '2025-12-31'::date, null,
    'at_risk', null,
    'PRJ-014:m4'
  ),
  (
    'PRJ-015', 'm1', 'Academic Complex Phase 1', 1,
    '2023-12-31'::date, '2024-08-10'::date,
    'completed', 222,
    'PRJ-015:m1'
  ),
  (
    'PRJ-015', 'm2', 'Residential Complex', 2,
    '2024-06-30'::date, null,
    'delayed', 180,
    'PRJ-015:m2'
  ),
  (
    'PRJ-015', 'm3', 'Library & Admin Block', 3,
    '2024-12-31'::date, null,
    'delayed', 150,
    'PRJ-015:m3'
  ),
  (
    'PRJ-015', 'm4', 'Sports & Recreation', 4,
    '2025-03-31'::date, null,
    'at_risk', null,
    'PRJ-015:m4'
  ),
  (
    'PRJ-016', 'm1', 'Forest Clearance', 1,
    '2023-12-31'::date, '2024-04-20'::date,
    'completed', 111,
    'PRJ-016:m1'
  ),
  (
    'PRJ-016', 'm2', 'Overburden Removal 30%', 2,
    '2025-06-30'::date, '2025-09-10'::date,
    'completed', 72,
    'PRJ-016:m2'
  ),
  (
    'PRJ-016', 'm3', 'First Coal Production', 3,
    '2025-12-31'::date, null,
    'delayed', 60,
    'PRJ-016:m3'
  ),
  (
    'PRJ-016', 'm4', 'Target Production 15 MTPA', 4,
    '2026-06-30'::date, null,
    'at_risk', null,
    'PRJ-016:m4'
  ),
  (
    'PRJ-017', 'm1', 'Blast Furnace 3 Commission', 1,
    '2025-03-31'::date, '2025-06-10'::date,
    'completed', 71,
    'PRJ-017:m1'
  ),
  (
    'PRJ-017', 'm2', 'Hot Strip Mill Erection', 2,
    '2025-09-30'::date, null,
    'delayed', 45,
    'PRJ-017:m2'
  ),
  (
    'PRJ-017', 'm3', 'Cold Rolling Mill', 3,
    '2026-03-31'::date, null,
    'at_risk', null,
    'PRJ-017:m3'
  ),
  (
    'PRJ-017', 'm4', 'Full Capacity Commissioning', 4,
    '2026-06-30'::date, null,
    'at_risk', null,
    'PRJ-017:m4'
  ),
  (
    'PRJ-018', 'm1', 'Piling Works 50%', 1,
    '2025-06-30'::date, '2025-09-15'::date,
    'completed', 77,
    'PRJ-018:m1'
  ),
  (
    'PRJ-018', 'm2', 'Viaduct 20%', 2,
    '2025-12-31'::date, null,
    'on_track', null,
    'PRJ-018:m2'
  ),
  (
    'PRJ-018', 'm3', 'Viaduct 50%', 3,
    '2026-09-30'::date, null,
    'on_track', null,
    'PRJ-018:m3'
  ),
  (
    'PRJ-019', 'm1', 'Civil Package Award', 1,
    '2024-09-30'::date, '2024-11-20'::date,
    'completed', 51,
    'PRJ-019:m1'
  ),
  (
    'PRJ-019', 'm2', 'Piling Works Start', 2,
    '2025-03-31'::date, '2025-05-10'::date,
    'completed', 40,
    'PRJ-019:m2'
  ),
  (
    'PRJ-019', 'm3', 'Underground Section 20%', 3,
    '2026-03-31'::date, null,
    'on_track', null,
    'PRJ-019:m3'
  ),
  (
    'PRJ-019', 'm4', 'Elevated Section 30%', 4,
    '2026-09-30'::date, null,
    'on_track', null,
    'PRJ-019:m4'
  ),
  (
    'PRJ-020', 'm1', 'Underground Section Complete', 1,
    '2025-06-30'::date, '2025-09-20'::date,
    'completed', 82,
    'PRJ-020:m1'
  ),
  (
    'PRJ-020', 'm2', 'Systems & OHE', 2,
    '2025-12-31'::date, null,
    'delayed', 45,
    'PRJ-020:m2'
  ),
  (
    'PRJ-020', 'm3', 'Trial Runs', 3,
    '2026-03-31'::date, null,
    'at_risk', null,
    'PRJ-020:m3'
  ),
  (
    'PRJ-020', 'm4', 'Commercial Operations', 4,
    '2026-06-30'::date, null,
    'at_risk', null,
    'PRJ-020:m4'
  ),
  (
    'PRJ-021', 'm1', 'Environmental Clearance', 1,
    '2024-03-31'::date, '2024-09-10'::date,
    'completed', 163,
    'PRJ-021:m1'
  ),
  (
    'PRJ-021', 'm2', 'Dredging Contract Award', 2,
    '2025-06-30'::date, null,
    'delayed', 90,
    'PRJ-021:m2'
  ),
  (
    'PRJ-021', 'm3', 'Breakwater Phase 1', 3,
    '2026-06-30'::date, null,
    'at_risk', null,
    'PRJ-021:m3'
  ),
  (
    'PRJ-022', 'm1', 'TBM Breakthrough Main Bore', 1,
    '2025-03-31'::date, '2025-07-20'::date,
    'completed', 111,
    'PRJ-022:m1'
  ),
  (
    'PRJ-022', 'm2', 'Escape Tunnel Complete', 2,
    '2025-09-30'::date, null,
    'delayed', 60,
    'PRJ-022:m2'
  ),
  (
    'PRJ-022', 'm3', 'MEP & Safety Systems', 3,
    '2026-03-31'::date, null,
    'at_risk', null,
    'PRJ-022:m3'
  ),
  (
    'PRJ-022', 'm4', 'Trial Run', 4,
    '2026-09-30'::date, null,
    'at_risk', null,
    'PRJ-022:m4'
  ),
  (
    'PRJ-023', 'm1', 'Tunnel T-3 Breakthrough', 1,
    '2023-03-31'::date, '2024-01-15'::date,
    'completed', 290,
    'PRJ-023:m1'
  ),
  (
    'PRJ-023', 'm2', 'Tunnel T-7 Start', 2,
    '2023-12-31'::date, '2024-10-20'::date,
    'completed', 294,
    'PRJ-023:m2'
  ),
  (
    'PRJ-023', 'm3', '50% Tunneling Complete', 3,
    '2024-12-31'::date, null,
    'delayed', 300,
    'PRJ-023:m3'
  ),
  (
    'PRJ-023', 'm4', 'Bridge Works 60%', 4,
    '2025-12-31'::date, null,
    'delayed', 200,
    'PRJ-023:m4'
  ),
  (
    'PRJ-023', 'm5', 'Track Laying Start', 5,
    '2026-12-31'::date, null,
    'at_risk', null,
    'PRJ-023:m5'
  ),
  (
    'PRJ-024', 'm1', 'Cofferdam Completion', 1,
    '2021-03-31'::date, '2022-11-10'::date,
    'completed', 589,
    'PRJ-024:m1'
  ),
  (
    'PRJ-024', 'm2', 'Spillway Gates 50%', 2,
    '2023-06-30'::date, '2025-01-20'::date,
    'completed', 569,
    'PRJ-024:m2'
  ),
  (
    'PRJ-024', 'm3', 'Earth Dam Completion', 3,
    '2024-03-31'::date, null,
    'delayed', 400,
    'PRJ-024:m3'
  ),
  (
    'PRJ-024', 'm4', 'Powerhouse Installation', 4,
    '2025-12-31'::date, null,
    'delayed', 300,
    'PRJ-024:m4'
  ),
  (
    'PRJ-024', 'm5', 'First Power Generation', 5,
    '2026-12-31'::date, null,
    'at_risk', null,
    'PRJ-024:m5'
  ),
  (
    'PRJ-025', 'm1', 'Land Levelling Complete', 1,
    '2024-03-31'::date, '2024-06-20'::date,
    'completed', 81,
    'PRJ-025:m1'
  ),
  (
    'PRJ-025', 'm2', 'Runway Pavement 60%', 2,
    '2024-12-31'::date, '2025-04-10'::date,
    'completed', 100,
    'PRJ-025:m2'
  ),
  (
    'PRJ-025', 'm3', 'Terminal Building Structural', 3,
    '2025-09-30'::date, null,
    'delayed', 90,
    'PRJ-025:m3'
  ),
  (
    'PRJ-025', 'm4', 'ATM & Navigation Systems', 4,
    '2026-06-30'::date, null,
    'at_risk', null,
    'PRJ-025:m4'
  ),
  (
    'PRJ-025', 'm5', 'Commissioning & Trial Flights', 5,
    '2026-12-31'::date, null,
    'at_risk', null,
    'PRJ-025:m5'
  ),
  (
    'PRJ-026', 'm1', 'Land Acquisition 100%', 1,
    '2023-03-31'::date, '2023-09-20'::date,
    'completed', 173,
    'PRJ-026:m1'
  ),
  (
    'PRJ-026', 'm2', 'Runway 1 Earthwork', 2,
    '2024-03-31'::date, '2025-01-10'::date,
    'completed', 285,
    'PRJ-026:m2'
  ),
  (
    'PRJ-026', 'm3', 'Terminal Piling', 3,
    '2025-06-30'::date, null,
    'delayed', 120,
    'PRJ-026:m3'
  ),
  (
    'PRJ-026', 'm4', 'Runway Pavement Start', 4,
    '2026-03-31'::date, null,
    'delayed', 90,
    'PRJ-026:m4'
  ),
  (
    'PRJ-026', 'm5', 'Terminal Structure', 5,
    '2026-12-31'::date, null,
    'at_risk', null,
    'PRJ-026:m5'
  ),
  (
    'PRJ-027', 'm1', 'Breakthrough', 1,
    '2022-12-31'::date, '2023-02-10'::date,
    'completed', 41,
    'PRJ-027:m1'
  ),
  (
    'PRJ-027', 'm2', 'Civil Finishing', 2,
    '2023-09-30'::date, '2023-12-20'::date,
    'completed', 81,
    'PRJ-027:m2'
  ),
  (
    'PRJ-027', 'm3', 'Inauguration', 3,
    '2023-12-31'::date, '2024-02-28'::date,
    'completed', 59,
    'PRJ-027:m3'
  ),
  (
    'PRJ-028', 'm1', 'Site Preparation', 1,
    '2025-03-31'::date, '2025-05-20'::date,
    'completed', 50,
    'PRJ-028:m1'
  ),
  (
    'PRJ-028', 'm2', 'Crude Distillation Unit Foundation', 2,
    '2025-12-31'::date, null,
    'on_track', null,
    'PRJ-028:m2'
  ),
  (
    'PRJ-028', 'm3', 'CDU Structural Steel', 3,
    '2026-09-30'::date, null,
    'on_track', null,
    'PRJ-028:m3'
  ),
  (
    'PRJ-029', 'm1', 'Land Acquisition 100%', 1,
    '2024-06-30'::date, '2024-08-10'::date,
    'completed', 41,
    'PRJ-029:m1'
  ),
  (
    'PRJ-029', 'm2', 'Pavement 50%', 2,
    '2025-06-30'::date, '2025-09-20'::date,
    'completed', 82,
    'PRJ-029:m2'
  ),
  (
    'PRJ-029', 'm3', 'Pavement 80%', 3,
    '2026-03-31'::date, null,
    'on_track', null,
    'PRJ-029:m3'
  ),
  (
    'PRJ-029', 'm4', 'Structures Complete', 4,
    '2026-06-30'::date, null,
    'on_track', null,
    'PRJ-029:m4'
  ),
  (
    'PRJ-030', 'm1', '10000 Village Electrification', 1,
    '2024-06-30'::date, '2024-09-10'::date,
    'completed', 72,
    'PRJ-030:m1'
  ),
  (
    'PRJ-030', 'm2', 'Distribution Lines 70%', 2,
    '2025-06-30'::date, null,
    'delayed', 90,
    'PRJ-030:m2'
  ),
  (
    'PRJ-030', 'm3', 'Transformers Installation 80%', 3,
    '2025-12-31'::date, null,
    'at_risk', null,
    'PRJ-030:m3'
  ),
  (
    'PRJ-031', 'm1', 'Rail Link Foundation', 1,
    '2025-03-31'::date, '2025-05-10'::date,
    'completed', 40,
    'PRJ-031:m1'
  ),
  (
    'PRJ-031', 'm2', 'Road Approach Works', 2,
    '2025-09-30'::date, null,
    'on_track', null,
    'PRJ-031:m2'
  ),
  (
    'PRJ-031', 'm3', 'Railway Siding', 3,
    '2026-03-31'::date, null,
    'on_track', null,
    'PRJ-031:m3'
  ),
  (
    'PRJ-032', 'm1', 'Jetty Construction', 1,
    '2025-06-30'::date, '2025-09-15'::date,
    'completed', 77,
    'PRJ-032:m1'
  ),
  (
    'PRJ-032', 'm2', 'Warehouse Block A', 2,
    '2025-12-31'::date, null,
    'on_track', null,
    'PRJ-032:m2'
  ),
  (
    'PRJ-032', 'm3', 'Rail Siding Connection', 3,
    '2026-06-30'::date, null,
    'on_track', null,
    'PRJ-032:m3'
  ),
  (
    'PRJ-033', 'm1', 'Diversion Tunnel', 1,
    '2022-12-31'::date, '2024-03-20'::date,
    'completed', 445,
    'PRJ-033:m1'
  ),
  (
    'PRJ-033', 'm2', 'Dam Foundation', 2,
    '2024-12-31'::date, null,
    'delayed', 300,
    'PRJ-033:m2'
  ),
  (
    'PRJ-033', 'm3', 'Main Dam Body 25%', 3,
    '2026-06-30'::date, null,
    'at_risk', null,
    'PRJ-033:m3'
  ),
  (
    'PRJ-034', 'm1', 'Master Plan Approval', 1,
    '2024-12-31'::date, '2025-01-20'::date,
    'completed', 20,
    'PRJ-034:m1'
  ),
  (
    'PRJ-034', 'm2', 'Infrastructure Works Start', 2,
    '2025-09-30'::date, null,
    'on_track', null,
    'PRJ-034:m2'
  ),
  (
    'PRJ-034', 'm3', 'Phase 1 Plots Ready', 3,
    '2026-09-30'::date, null,
    'on_track', null,
    'PRJ-034:m3'
  ),
  (
    'PRJ-035', 'm1', 'Pavement 50%', 1,
    '2024-06-30'::date, '2024-09-10'::date,
    'completed', 72,
    'PRJ-035:m1'
  ),
  (
    'PRJ-035', 'm2', 'Structures 90%', 2,
    '2024-12-31'::date, '2025-03-20'::date,
    'completed', 79,
    'PRJ-035:m2'
  ),
  (
    'PRJ-035', 'm3', 'Pavement 90%', 3,
    '2025-06-30'::date, null,
    'delayed', 60,
    'PRJ-035:m3'
  ),
  (
    'PRJ-035', 'm4', 'Toll Plazas Complete', 4,
    '2025-09-30'::date, null,
    'delayed', 45,
    'PRJ-035:m4'
  ),
  (
    'PRJ-035', 'm5', 'Inauguration', 5,
    '2025-12-31'::date, null,
    'at_risk', null,
    'PRJ-035:m5'
  ),
  (
    'PRJ-036', 'm1', 'Academic Complex Handover', 1,
    '2025-03-31'::date, '2025-06-10'::date,
    'completed', 71,
    'PRJ-036:m1'
  ),
  (
    'PRJ-036', 'm2', 'OPD Block Completion', 2,
    '2025-09-30'::date, null,
    'delayed', 30,
    'PRJ-036:m2'
  ),
  (
    'PRJ-036', 'm3', 'Hospital Block Commissioning', 3,
    '2025-12-31'::date, null,
    'at_risk', null,
    'PRJ-036:m3'
  ),
  (
    'PRJ-037', 'm1', 'Pipeline Laying 60%', 1,
    '2024-06-30'::date, '2024-09-15'::date,
    'completed', 77,
    'PRJ-037:m1'
  ),
  (
    'PRJ-037', 'm2', 'Pipeline Laying 90%', 2,
    '2024-12-31'::date, '2025-04-10'::date,
    'completed', 100,
    'PRJ-037:m2'
  ),
  (
    'PRJ-037', 'm3', 'Hydrotesting', 3,
    '2025-06-30'::date, null,
    'delayed', 60,
    'PRJ-037:m3'
  ),
  (
    'PRJ-037', 'm4', 'Commissioning', 4,
    '2025-12-31'::date, null,
    'at_risk', null,
    'PRJ-037:m4'
  ),
  (
    'PRJ-038', 'm1', 'Site Preparation', 1,
    '2025-06-30'::date, '2025-07-20'::date,
    'completed', 20,
    'PRJ-038:m1'
  ),
  (
    'PRJ-038', 'm2', 'Civil Construction Phase 1', 2,
    '2025-12-31'::date, null,
    'on_track', null,
    'PRJ-038:m2'
  ),
  (
    'PRJ-038', 'm3', 'Cleanroom Construction', 3,
    '2026-06-30'::date, null,
    'on_track', null,
    'PRJ-038:m3'
  ),
  (
    'PRJ-039', 'm1', 'Unit 1 Commissioning', 1,
    '2025-03-31'::date, '2025-06-20'::date,
    'completed', 81,
    'PRJ-039:m1'
  ),
  (
    'PRJ-039', 'm2', 'Unit 2 Commissioning', 2,
    '2025-09-30'::date, null,
    'delayed', 45,
    'PRJ-039:m2'
  ),
  (
    'PRJ-039', 'm3', 'Full Capacity Operation', 3,
    '2025-12-31'::date, null,
    'at_risk', null,
    'PRJ-039:m3'
  ),
  (
    'PRJ-040', 'm1', 'Portal Civil Works', 1,
    '2024-03-31'::date, '2024-08-10'::date,
    'completed', 132,
    'PRJ-040:m1'
  ),
  (
    'PRJ-040', 'm2', 'Tunnel Boring 40%', 2,
    '2025-03-31'::date, null,
    'delayed', 150,
    'PRJ-040:m2'
  ),
  (
    'PRJ-040', 'm3', 'Tunnel Boring Complete', 3,
    '2025-12-31'::date, null,
    'delayed', 180,
    'PRJ-040:m3'
  ),
  (
    'PRJ-040', 'm4', 'Civil Fit-out', 4,
    '2026-09-30'::date, null,
    'at_risk', null,
    'PRJ-040:m4'
  )
) as values_table(
  project_code, milestone_code, name, sequence_no, planned_date, actual_date,
  status, delay_days, source_record_id
)
join public.projects on projects.project_code = values_table.project_code
left join lateral (
  select updates.id
  from public.project_monthly_updates updates
  where updates.project_id = projects.id
  order by updates.reporting_month desc
  limit 1
) monthly_updates on true
on conflict (project_id, milestone_code) do update set
  name = excluded.name,
  sequence_no = excluded.sequence_no,
  planned_date = excluded.planned_date,
  actual_date = excluded.actual_date,
  status = excluded.status,
  delay_days = excluded.delay_days,
  source_update_id = excluded.source_update_id;

insert into public.project_cost_history (
  project_id, effective_date, approved_cost, revised_cost, expenditure,
  estimated_at_completion, change_amount, change_reason, source_update_id, metadata
)
select
  projects.id,
  values_table.effective_date,
  values_table.approved_cost,
  values_table.revised_cost,
  values_table.expenditure,
  values_table.revised_cost,
  values_table.revised_cost - values_table.approved_cost,
  'Initial synthetic portfolio snapshot',
  updates.id,
  '{"seed":true,"synthetic":true}'::jsonb
from (values
  ('PRJ-001', '2026-04-30'::date, 110000, 127500, 41200),
  ('PRJ-002', '2026-04-28'::date, 97800, 104600, 18200),
  ('PRJ-003', '2026-04-30'::date, 32500, 34800, 28600),
  ('PRJ-004', '2026-04-29'::date, 48200, 51800, 22400),
  ('PRJ-005', '2026-04-25'::date, 12000, 13800, 9800),
  ('PRJ-006', '2026-04-28'::date, 26400, 27100, 8200),
  ('PRJ-007', '2026-04-30'::date, 39400, 45800, 12600),
  ('PRJ-008', '2026-04-29'::date, 18600, 19200, 11800),
  ('PRJ-009', '2026-04-28'::date, 14200, 15600, 6800),
  ('PRJ-010', '2026-04-27'::date, 44605, 48900, 8400),
  ('PRJ-011', '2026-04-29'::date, 28600, 29400, 19800),
  ('PRJ-012', '2026-04-28'::date, 22400, 24100, 7600),
  ('PRJ-013', '2026-04-30'::date, 4800, 5100, 3200),
  ('PRJ-014', '2026-04-26'::date, 7200, 8100, 4800),
  ('PRJ-015', '2026-04-25'::date, 3200, 3950, 2100),
  ('PRJ-016', '2026-04-28'::date, 9800, 10600, 5200),
  ('PRJ-017', '2026-04-27'::date, 23600, 26800, 18900),
  ('PRJ-018', '2026-04-29'::date, 31200, 33400, 9800),
  ('PRJ-019', '2026-04-26'::date, 61843, 67200, 18500),
  ('PRJ-020', '2026-04-27'::date, 8379, 9100, 6200),
  ('PRJ-021', '2026-04-28'::date, 76220, 82400, 12400),
  ('PRJ-022', '2026-04-28'::date, 6809, 8100, 4600),
  ('PRJ-023', '2026-04-26'::date, 16216, 20500, 7200),
  ('PRJ-024', '2026-04-29'::date, 55548, 71000, 32000),
  ('PRJ-025', '2026-04-30'::date, 16700, 18200, 11800),
  ('PRJ-026', '2026-04-28'::date, 29560, 31400, 9200),
  ('PRJ-027', '2026-04-01'::date, 687, 825, 825),
  ('PRJ-028', '2026-04-29'::date, 34100, 36500, 14200),
  ('PRJ-029', '2026-04-30'::date, 17800, 18400, 12600),
  ('PRJ-030', '2026-04-27'::date, 8200, 8800, 6100),
  ('PRJ-031', '2026-04-28'::date, 5600, 5900, 3800),
  ('PRJ-032', '2026-04-29'::date, 2900, 3100, 1400),
  ('PRJ-033', '2026-04-26'::date, 5796, 8200, 2100),
  ('PRJ-034', '2026-04-27'::date, 4200, 4450, 1800),
  ('PRJ-035', '2026-04-30'::date, 36230, 38500, 28000),
  ('PRJ-036', '2026-04-30'::date, 4026, 4100, 3600),
  ('PRJ-037', '2026-04-28'::date, 6200, 6800, 5100),
  ('PRJ-038', '2026-04-29'::date, 91000, 93000, 21000),
  ('PRJ-039', '2026-04-30'::date, 7200, 7500, 6800),
  ('PRJ-040', '2026-04-27'::date, 4200, 5100, 2800)
) as values_table(project_code, effective_date, approved_cost, revised_cost, expenditure)
join public.projects on projects.project_code = values_table.project_code
left join public.project_monthly_updates updates
  on updates.project_id = projects.id
  and updates.reporting_month = date_trunc('month', values_table.effective_date)::date
where not exists (
  select 1 from public.project_cost_history existing
  where existing.project_id = projects.id and existing.effective_date = values_table.effective_date
);

insert into public.project_schedule_history (
  project_id, effective_date, original_completion_date, revised_completion_date,
  forecast_completion_date, delay_days, physical_progress, planned_progress,
  revision_reason, source_update_id, metadata
)
select
  projects.id,
  values_table.effective_date,
  values_table.original_completion_date,
  values_table.revised_completion_date,
  values_table.revised_completion_date,
  values_table.delay_days,
  values_table.physical_progress,
  values_table.planned_progress,
  'Initial synthetic portfolio snapshot',
  updates.id,
  '{"seed":true,"synthetic":true}'::jsonb
from (values
  (
    'PRJ-001', '2026-04-30'::date, '2026-08-15'::date,
    '2028-03-31'::date, 594,
    34, 52
  ),
  (
    'PRJ-002', '2026-04-28'::date, '2027-12-31'::date,
    '2028-09-30'::date, 273,
    18, 28
  ),
  (
    'PRJ-003', '2026-04-30'::date, '2025-12-31'::date,
    '2026-08-31'::date, 243,
    88, 92
  ),
  (
    'PRJ-004', '2026-04-29'::date, '2026-06-30'::date,
    '2026-12-31'::date, 184,
    52, 58
  ),
  (
    'PRJ-005', '2026-04-25'::date, '2024-12-31'::date,
    '2026-06-30'::date, 547,
    78, 85
  ),
  (
    'PRJ-006', '2026-04-28'::date, '2027-12-31'::date,
    '2028-03-31'::date, 91,
    32, 30
  ),
  (
    'PRJ-007', '2026-04-30'::date, '2027-06-30'::date,
    '2028-12-31'::date, 549,
    28, 38
  ),
  (
    'PRJ-008', '2026-04-29'::date, '2026-09-30'::date,
    '2026-12-31'::date, 92,
    62, 65
  ),
  (
    'PRJ-009', '2026-04-28'::date, '2026-03-31'::date,
    '2027-03-31'::date, 365,
    47, 55
  ),
  (
    'PRJ-010', '2026-04-27'::date, '2028-03-31'::date,
    '2030-03-31'::date, 731,
    14, 22
  ),
  (
    'PRJ-011', '2026-04-29'::date, '2026-03-31'::date,
    '2026-09-30'::date, 183,
    71, 74
  ),
  (
    'PRJ-012', '2026-04-28'::date, '2026-12-31'::date,
    '2027-09-30'::date, 273,
    31, 45
  ),
  (
    'PRJ-013', '2026-04-30'::date, '2026-06-30'::date,
    '2026-09-30'::date, 92,
    68, 70
  ),
  (
    'PRJ-014', '2026-04-26'::date, '2025-12-31'::date,
    '2026-09-30'::date, 273,
    62, 72
  ),
  (
    'PRJ-015', '2026-04-25'::date, '2025-03-31'::date,
    '2026-12-31'::date, 641,
    56, 68
  ),
  (
    'PRJ-016', '2026-04-28'::date, '2026-06-30'::date,
    '2026-12-31'::date, 184,
    55, 60
  ),
  (
    'PRJ-017', '2026-04-27'::date, '2026-03-31'::date,
    '2026-09-30'::date, 183,
    74, 78
  ),
  (
    'PRJ-018', '2026-04-29'::date, '2028-03-31'::date,
    '2028-09-30'::date, 183,
    30, 35
  ),
  (
    'PRJ-019', '2026-04-26'::date, '2028-12-31'::date,
    '2029-06-30'::date, 181,
    27, 32
  ),
  (
    'PRJ-020', '2026-04-27'::date, '2026-03-31'::date,
    '2026-09-30'::date, 183,
    72, 75
  ),
  (
    'PRJ-021', '2026-04-28'::date, '2030-03-31'::date,
    '2031-03-31'::date, 365,
    14, 18
  ),
  (
    'PRJ-022', '2026-04-28'::date, '2026-09-30'::date,
    '2027-06-30'::date, 273,
    64, 72
  ),
  (
    'PRJ-023', '2026-04-26'::date, '2024-12-31'::date,
    '2027-12-31'::date, 1095,
    42, 55
  ),
  (
    'PRJ-024', '2026-04-29'::date, '2022-12-31'::date,
    '2027-03-31'::date, 1552,
    52, 72
  ),
  (
    'PRJ-025', '2026-04-30'::date, '2025-12-31'::date,
    '2026-12-31'::date, 365,
    68, 75
  ),
  (
    'PRJ-026', '2026-04-28'::date, '2024-09-30'::date,
    '2027-03-31'::date, 913,
    31, 38
  ),
  (
    'PRJ-027', '2026-04-01'::date, '2023-12-31'::date,
    '2024-02-28'::date, 59,
    100, 100
  ),
  (
    'PRJ-028', '2026-04-29'::date, '2027-03-31'::date,
    '2027-09-30'::date, 183,
    40, 45
  ),
  (
    'PRJ-029', '2026-04-30'::date, '2026-09-30'::date,
    '2026-12-31'::date, 92,
    70, 72
  ),
  (
    'PRJ-030', '2026-04-27'::date, '2025-12-31'::date,
    '2026-09-30'::date, 273,
    75, 80
  ),
  (
    'PRJ-031', '2026-04-28'::date, '2026-06-30'::date,
    '2026-09-30'::date, 92,
    65, 68
  ),
  (
    'PRJ-032', '2026-04-29'::date, '2026-12-31'::date,
    '2027-06-30'::date, 181,
    48, 52
  ),
  (
    'PRJ-033', '2026-04-26'::date, '2025-06-30'::date,
    '2029-03-31'::date, 1370,
    28, 42
  ),
  (
    'PRJ-034', '2026-04-27'::date, '2027-03-31'::date,
    '2027-09-30'::date, 183,
    38, 40
  ),
  (
    'PRJ-035', '2026-04-30'::date, '2025-12-31'::date,
    '2026-09-30'::date, 273,
    82, 86
  ),
  (
    'PRJ-036', '2026-04-30'::date, '2025-12-31'::date,
    '2026-06-30'::date, 181,
    88, 90
  ),
  (
    'PRJ-037', '2026-04-28'::date, '2025-06-30'::date,
    '2026-03-31'::date, 274,
    82, 85
  ),
  (
    'PRJ-038', '2026-04-29'::date, '2026-12-31'::date,
    '2027-06-30'::date, 181,
    22, 24
  ),
  (
    'PRJ-039', '2026-04-30'::date, '2025-12-31'::date,
    '2026-06-30'::date, 181,
    94, 96
  ),
  (
    'PRJ-040', '2026-04-27'::date, '2025-12-31'::date,
    '2027-06-30'::date, 547,
    54, 65
  )
) as values_table(
  project_code, effective_date, original_completion_date, revised_completion_date,
  delay_days, physical_progress, planned_progress
)
join public.projects on projects.project_code = values_table.project_code
left join public.project_monthly_updates updates
  on updates.project_id = projects.id
  and updates.reporting_month = date_trunc('month', values_table.effective_date)::date
where not exists (
  select 1 from public.project_schedule_history existing
  where existing.project_id = projects.id and existing.effective_date = values_table.effective_date
);

insert into public.model_versions (
  name, version, model_type, algorithm, description, status,
  feature_schema, parameters, evaluation_metrics, training_data_version,
  trained_at, deployed_at
)
values (
  'pragati_x_deterministic_risk',
  '1.0.0',
  'risk_scoring',
  'weighted_arithmetic',
  'Frontend-compatible deterministic demonstration formula. Not a production ML model.',
  'active',
  '{"progressFactor":"number:0-100","costFactor":"number:0-100","scheduleFactor":"number:0-100","milestoneFactor":"number:0-100","expenditureFactor":"number:0-100"}'::jsonb,
  '{"progress":0.25,"cost":0.25,"schedule":0.25,"milestone":0.15,"expenditure":0.1}'::jsonb,
  '{}',
  'synthetic-demo-v1',
  '2026-04-30T00:00:00Z',
  '2026-04-30T00:00:00Z'
)
on conflict (name, version) do update set
  description = excluded.description,
  feature_schema = excluded.feature_schema,
  parameters = excluded.parameters,
  evaluation_metrics = excluded.evaluation_metrics;

insert into public.project_risks (
  project_id, model_version_id, source_update_id, assessed_at, assessment_period,
  overall_score, risk_level, cost_overrun_risk, schedule_delay_risk,
  implementation_risk, progress_factor, cost_factor, schedule_factor,
  milestone_factor, expenditure_factor, methodology, explanation,
  input_snapshot, is_current
)
select
  projects.id,
  model_versions.id,
  updates.id,
  values_table.assessed_at,
  values_table.assessment_period,
  values_table.overall_score,
  values_table.risk_level::public.risk_level,
  values_table.cost_overrun_risk,
  values_table.schedule_delay_risk,
  values_table.implementation_risk,
  values_table.progress_factor,
  values_table.cost_factor,
  values_table.schedule_factor,
  values_table.milestone_factor,
  values_table.expenditure_factor,
  'deterministic_frontend_v1',
  'Transparent weighted score seeded from the existing PRAGATI-X demonstration engine.',
  values_table.input_snapshot,
  true
from (values
  (
    'PRJ-001', '2026-04-30T00:00:00Z'::timestamptz, '2026-04-01'::date,
    59, 'watch',
    51, 86, 50,
    60, 32, 100,
    67, 10,
    '{"approvedCost":110000,"revisedCost":127500,"physicalProgress":34,"plannedProgress":52,"financialProgress":37,"delayDays":594}'::jsonb
  ),
  (
    'PRJ-002', '2026-04-28T00:00:00Z'::timestamptz, '2026-04-01'::date,
    38, 'watch',
    30, 63, 31,
    33, 14, 75,
    50, 0,
    '{"approvedCost":97800,"revisedCost":104600,"physicalProgress":18,"plannedProgress":28,"financialProgress":18,"delayDays":273}'::jsonb
  ),
  (
    'PRJ-003', '2026-04-30T00:00:00Z'::timestamptz, '2026-04-01'::date,
    30, 'healthy',
    24, 53, 19,
    13, 14, 67,
    40, 0,
    '{"approvedCost":32500,"revisedCost":34800,"physicalProgress":88,"plannedProgress":92,"financialProgress":87,"delayDays":243}'::jsonb
  ),
  (
    'PRJ-004', '2026-04-29T00:00:00Z'::timestamptz, '2026-04-01'::date,
    30, 'healthy',
    23, 50, 29,
    20, 15, 50,
    60, 0,
    '{"approvedCost":48200,"revisedCost":51800,"physicalProgress":52,"plannedProgress":58,"financialProgress":46,"delayDays":184}'::jsonb
  ),
  (
    'PRJ-005', '2026-04-25T00:00:00Z'::timestamptz, '2026-04-01'::date,
    48, 'watch',
    43, 80, 33,
    23, 30, 100,
    60, 10,
    '{"approvedCost":12000,"revisedCost":13800,"physicalProgress":78,"plannedProgress":85,"financialProgress":81,"delayDays":547}'::jsonb
  ),
  (
    'PRJ-006', '2026-04-28T00:00:00Z'::timestamptz, '2026-04-01'::date,
    8, 'healthy',
    8, 15, 0,
    0, 5, 25,
    0, 0,
    '{"approvedCost":26400,"revisedCost":27100,"physicalProgress":32,"plannedProgress":30,"financialProgress":31,"delayDays":91}'::jsonb
  ),
  (
    'PRJ-007', '2026-04-30T00:00:00Z'::timestamptz, '2026-04-01'::date,
    54, 'watch',
    46, 86, 42,
    33, 32, 100,
    75, 10,
    '{"approvedCost":39400,"revisedCost":45800,"physicalProgress":28,"plannedProgress":38,"financialProgress":31,"delayDays":549}'::jsonb
  ),
  (
    'PRJ-008', '2026-04-29T00:00:00Z'::timestamptz, '2026-04-01'::date,
    14, 'healthy',
    11, 22, 12,
    10, 6, 25,
    20, 3,
    '{"approvedCost":18600,"revisedCost":19200,"physicalProgress":62,"plannedProgress":65,"financialProgress":63,"delayDays":92}'::jsonb
  ),
  (
    'PRJ-009', '2026-04-28T00:00:00Z'::timestamptz, '2026-04-01'::date,
    48, 'watch',
    37, 85, 37,
    27, 20, 100,
    75, 0,
    '{"approvedCost":14200,"revisedCost":15600,"physicalProgress":47,"plannedProgress":55,"financialProgress":47,"delayDays":365}'::jsonb
  ),
  (
    'PRJ-010', '2026-04-27T00:00:00Z'::timestamptz, '2026-04-01'::date,
    45, 'watch',
    37, 78, 32,
    27, 19, 100,
    50, 13,
    '{"approvedCost":44605,"revisedCost":48900,"physicalProgress":14,"plannedProgress":22,"financialProgress":18,"delayDays":731}'::jsonb
  ),
  (
    'PRJ-011', '2026-04-29T00:00:00Z'::timestamptz, '2026-04-01'::date,
    24, 'healthy',
    15, 46, 22,
    10, 6, 50,
    50, 0,
    '{"approvedCost":28600,"revisedCost":29400,"physicalProgress":71,"plannedProgress":74,"financialProgress":69,"delayDays":183}'::jsonb
  ),
  (
    'PRJ-012', '2026-04-28T00:00:00Z'::timestamptz, '2026-04-01'::date,
    46, 'watch',
    33, 72, 47,
    47, 15, 75,
    75, 7,
    '{"approvedCost":22400,"revisedCost":24100,"physicalProgress":31,"plannedProgress":45,"financialProgress":33,"delayDays":273}'::jsonb
  ),
  (
    'PRJ-013', '2026-04-30T00:00:00Z'::timestamptz, '2026-04-01'::date,
    11, 'healthy',
    14, 16, 3,
    7, 13, 25,
    0, 0,
    '{"approvedCost":4800,"revisedCost":5100,"physicalProgress":68,"plannedProgress":70,"financialProgress":66,"delayDays":92}'::jsonb
  ),
  (
    'PRJ-014', '2026-04-26T00:00:00Z'::timestamptz, '2026-04-01'::date,
    46, 'watch',
    37, 71, 43,
    33, 25, 75,
    75, 13,
    '{"approvedCost":7200,"revisedCost":8100,"physicalProgress":62,"plannedProgress":72,"financialProgress":66,"delayDays":273}'::jsonb
  ),
  (
    'PRJ-015', '2026-04-25T00:00:00Z'::timestamptz, '2026-04-01'::date,
    61, 'high_risk',
    56, 87, 50,
    40, 47, 100,
    75, 30,
    '{"approvedCost":3200,"revisedCost":3950,"physicalProgress":56,"plannedProgress":68,"financialProgress":65,"delayDays":641}'::jsonb
  ),
  (
    'PRJ-016', '2026-04-28T00:00:00Z'::timestamptz, '2026-04-01'::date,
    28, 'healthy',
    23, 47, 24,
    17, 16, 50,
    50, 0,
    '{"approvedCost":9800,"revisedCost":10600,"physicalProgress":55,"plannedProgress":60,"financialProgress":53,"delayDays":184}'::jsonb
  ),
  (
    'PRJ-017', '2026-04-27T00:00:00Z'::timestamptz, '2026-04-01'::date,
    36, 'watch',
    29, 54, 37,
    13, 27, 50,
    75, 20,
    '{"approvedCost":23600,"revisedCost":26800,"physicalProgress":74,"plannedProgress":78,"financialProgress":80,"delayDays":183}'::jsonb
  ),
  (
    'PRJ-018', '2026-04-29T00:00:00Z'::timestamptz, '2026-04-01'::date,
    21, 'healthy',
    22, 32, 8,
    17, 14, 50,
    0, 3,
    '{"approvedCost":31200,"revisedCost":33400,"physicalProgress":30,"plannedProgress":35,"financialProgress":31,"delayDays":183}'::jsonb
  ),
  (
    'PRJ-019', '2026-04-26T00:00:00Z'::timestamptz, '2026-04-01'::date,
    22, 'healthy',
    24, 31, 8,
    17, 17, 50,
    0, 7,
    '{"approvedCost":61843,"revisedCost":67200,"physicalProgress":27,"plannedProgress":32,"financialProgress":29,"delayDays":181}'::jsonb
  ),
  (
    'PRJ-020', '2026-04-27T00:00:00Z'::timestamptz, '2026-04-01'::date,
    31, 'healthy',
    22, 54, 32,
    10, 17, 50,
    75, 7,
    '{"approvedCost":8379,"revisedCost":9100,"physicalProgress":72,"plannedProgress":75,"financialProgress":74,"delayDays":183}'::jsonb
  ),
  (
    'PRJ-021', '2026-04-28T00:00:00Z'::timestamptz, '2026-04-01'::date,
    43, 'watch',
    32, 81, 30,
    13, 16, 100,
    67, 7,
    '{"approvedCost":76220,"revisedCost":82400,"physicalProgress":14,"plannedProgress":18,"financialProgress":16,"delayDays":365}'::jsonb
  ),
  (
    'PRJ-022', '2026-04-28T00:00:00Z'::timestamptz, '2026-04-01'::date,
    47, 'watch',
    43, 70, 39,
    27, 38, 75,
    75, 10,
    '{"approvedCost":6809,"revisedCost":8100,"physicalProgress":64,"plannedProgress":72,"financialProgress":67,"delayDays":273}'::jsonb
  ),
  (
    'PRJ-023', '2026-04-26T00:00:00Z'::timestamptz, '2026-04-01'::date,
    59, 'watch',
    60, 82, 40,
    43, 53, 100,
    60, 7,
    '{"approvedCost":16216,"revisedCost":20500,"physicalProgress":42,"plannedProgress":55,"financialProgress":44,"delayDays":1095}'::jsonb
  ),
  (
    'PRJ-024', '2026-04-29T00:00:00Z'::timestamptz, '2026-04-01'::date,
    66, 'high_risk',
    67, 85, 52,
    67, 56, 100,
    60, 17,
    '{"approvedCost":55548,"revisedCost":71000,"physicalProgress":52,"plannedProgress":72,"financialProgress":57,"delayDays":1552}'::jsonb
  ),
  (
    'PRJ-025', '2026-04-30T00:00:00Z'::timestamptz, '2026-04-01'::date,
    45, 'watch',
    35, 80, 32,
    23, 18, 100,
    60, 7,
    '{"approvedCost":16700,"revisedCost":18200,"physicalProgress":68,"plannedProgress":75,"financialProgress":70,"delayDays":365}'::jsonb
  ),
  (
    'PRJ-026', '2026-04-28T00:00:00Z'::timestamptz, '2026-04-01'::date,
    43, 'watch',
    32, 80, 30,
    23, 12, 100,
    60, 0,
    '{"approvedCost":29560,"revisedCost":31400,"physicalProgress":31,"plannedProgress":38,"financialProgress":31,"delayDays":913}'::jsonb
  ),
  (
    'PRJ-027', '2026-04-01T00:00:00Z'::timestamptz, '2026-04-01'::date,
    14, 'healthy',
    27, 10, 0,
    0, 40, 16,
    0, 0,
    '{"approvedCost":687,"revisedCost":825,"physicalProgress":100,"plannedProgress":100,"financialProgress":100,"delayDays":59}'::jsonb
  ),
  (
    'PRJ-028', '2026-04-29T00:00:00Z'::timestamptz, '2026-04-01'::date,
    21, 'healthy',
    22, 32, 8,
    17, 14, 50,
    0, 3,
    '{"approvedCost":34100,"revisedCost":36500,"physicalProgress":40,"plannedProgress":45,"financialProgress":41,"delayDays":183}'::jsonb
  ),
  (
    'PRJ-029', '2026-04-30T00:00:00Z'::timestamptz, '2026-04-01'::date,
    10, 'healthy',
    10, 16, 3,
    7, 7, 25,
    0, 0,
    '{"approvedCost":17800,"revisedCost":18400,"physicalProgress":70,"plannedProgress":72,"financialProgress":70,"delayDays":92}'::jsonb
  ),
  (
    'PRJ-030', '2026-04-27T00:00:00Z'::timestamptz, '2026-04-01'::date,
    37, 'watch',
    27, 67, 30,
    17, 15, 75,
    67, 0,
    '{"approvedCost":8200,"revisedCost":8800,"physicalProgress":75,"plannedProgress":80,"financialProgress":74,"delayDays":273}'::jsonb
  ),
  (
    'PRJ-031', '2026-04-28T00:00:00Z'::timestamptz, '2026-04-01'::date,
    12, 'healthy',
    13, 16, 6,
    10, 11, 25,
    0, 7,
    '{"approvedCost":5600,"revisedCost":5900,"physicalProgress":65,"plannedProgress":68,"financialProgress":67,"delayDays":92}'::jsonb
  ),
  (
    'PRJ-032', '2026-04-29T00:00:00Z'::timestamptz, '2026-04-01'::date,
    19, 'healthy',
    21, 31, 5,
    13, 14, 50,
    0, 0,
    '{"approvedCost":2900,"revisedCost":3100,"physicalProgress":48,"plannedProgress":52,"financialProgress":48,"delayDays":181}'::jsonb
  ),
  (
    'PRJ-033', '2026-04-26T00:00:00Z'::timestamptz, '2026-04-01'::date,
    70, 'high_risk',
    79, 85, 49,
    47, 83, 100,
    67, 27,
    '{"approvedCost":5796,"revisedCost":8200,"physicalProgress":28,"plannedProgress":42,"financialProgress":36,"delayDays":1370}'::jsonb
  ),
  (
    'PRJ-034', '2026-04-27T00:00:00Z'::timestamptz, '2026-04-01'::date,
    19, 'healthy',
    19, 31, 6,
    7, 12, 50,
    0, 13,
    '{"approvedCost":4200,"revisedCost":4450,"physicalProgress":38,"plannedProgress":40,"financialProgress":42,"delayDays":183}'::jsonb
  ),
  (
    'PRJ-035', '2026-04-30T00:00:00Z'::timestamptz, '2026-04-01'::date,
    34, 'healthy',
    25, 64, 26,
    13, 13, 75,
    60, 0,
    '{"approvedCost":36230,"revisedCost":38500,"physicalProgress":82,"plannedProgress":86,"financialProgress":77,"delayDays":273}'::jsonb
  ),
  (
    'PRJ-036', '2026-04-30T00:00:00Z'::timestamptz, '2026-04-01'::date,
    25, 'healthy',
    13, 50, 26,
    7, 4, 50,
    67, 0,
    '{"approvedCost":4026,"revisedCost":4100,"physicalProgress":88,"plannedProgress":90,"financialProgress":87,"delayDays":181}'::jsonb
  ),
  (
    'PRJ-037', '2026-04-28T00:00:00Z'::timestamptz, '2026-04-01'::date,
    34, 'healthy',
    29, 61, 22,
    10, 19, 75,
    50, 0,
    '{"approvedCost":6200,"revisedCost":6800,"physicalProgress":82,"plannedProgress":85,"financialProgress":82,"delayDays":274}'::jsonb
  ),
  (
    'PRJ-038', '2026-04-29T00:00:00Z'::timestamptz, '2026-04-01'::date,
    15, 'healthy',
    14, 30, 4,
    7, 4, 50,
    0, 3,
    '{"approvedCost":91000,"revisedCost":93000,"physicalProgress":22,"plannedProgress":24,"financialProgress":23,"delayDays":181}'::jsonb
  ),
  (
    'PRJ-039', '2026-04-30T00:00:00Z'::timestamptz, '2026-04-01'::date,
    26, 'healthy',
    16, 50, 26,
    7, 8, 50,
    67, 0,
    '{"approvedCost":7200,"revisedCost":7500,"physicalProgress":94,"plannedProgress":96,"financialProgress":94,"delayDays":181}'::jsonb
  ),
  (
    'PRJ-040', '2026-04-27T00:00:00Z'::timestamptz, '2026-04-01'::date,
    60, 'high_risk',
    53, 86, 51,
    37, 43, 100,
    75, 40,
    '{"approvedCost":4200,"revisedCost":5100,"physicalProgress":54,"plannedProgress":65,"financialProgress":66,"delayDays":547}'::jsonb
  )
) as values_table(
  project_code, assessed_at, assessment_period, overall_score, risk_level,
  cost_overrun_risk, schedule_delay_risk, implementation_risk, progress_factor,
  cost_factor, schedule_factor, milestone_factor, expenditure_factor, input_snapshot
)
join public.projects on projects.project_code = values_table.project_code
join public.model_versions on model_versions.name = 'pragati_x_deterministic_risk'
  and model_versions.version = '1.0.0'
left join public.project_monthly_updates updates
  on updates.project_id = projects.id
  and updates.reporting_month = values_table.assessment_period
where not exists (
  select 1 from public.project_risks existing
  where existing.project_id = projects.id and existing.is_current
);

insert into public.risk_drivers (
  risk_id, driver_code, name, impact, value, weighted_contribution,
  rank, description, evidence, metadata
)
select
  risks.id,
  values_table.driver_code,
  values_table.name,
  values_table.impact::public.risk_impact,
  values_table.value,
  values_table.weighted_contribution,
  values_table.rank,
  values_table.description,
  '[]'::jsonb,
  '{"seed":true,"synthetic":true}'::jsonb
from (values
  (
    'PRJ-001', 'schedule_delay', 'Schedule Delay',
    'high', 100,
    25, 1, 'Project is delayed by 594 days beyond original completion date'
  ),
  (
    'PRJ-001', 'milestone_slippage', 'Milestone Slippage',
    'high', 67,
    10.05, 2, '4 of 6 milestones are delayed or at risk'
  ),
  (
    'PRJ-001', 'progress_variance', 'Progress Variance',
    'high', 60,
    15, 3, 'Physical progress (34%) is 18.0pp below expected (52%)'
  ),
  (
    'PRJ-001', 'cost_escalation', 'Cost Escalation',
    'medium', 32,
    8, 4, 'Revised cost ₹1,27,500 Cr vs approved ₹1,10,000 Cr (+15.9%)'
  ),
  (
    'PRJ-001', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 10,
    1, 5, 'Financial progress (37%) vs physical progress (34%) — gap of 3.0pp'
  ),
  (
    'PRJ-002', 'schedule_delay', 'Schedule Delay',
    'high', 75,
    18.75, 1, 'Project is delayed by 273 days beyond original completion date'
  ),
  (
    'PRJ-002', 'milestone_slippage', 'Milestone Slippage',
    'medium', 50,
    7.5, 2, '2 of 4 milestones are delayed or at risk'
  ),
  (
    'PRJ-002', 'progress_variance', 'Progress Variance',
    'medium', 33,
    8.25, 3, 'Physical progress (18%) is 10.0pp below expected (28%)'
  ),
  (
    'PRJ-002', 'cost_escalation', 'Cost Escalation',
    'low', 14,
    3.5, 4, 'Revised cost ₹1,04,600 Cr vs approved ₹97,800 Cr (+7.0%)'
  ),
  (
    'PRJ-002', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 0,
    0, 5, 'Financial progress (18%) vs physical progress (18%) — gap of 0.0pp'
  ),
  (
    'PRJ-003', 'schedule_delay', 'Schedule Delay',
    'high', 67,
    16.75, 1, 'Project is delayed by 243 days beyond original completion date'
  ),
  (
    'PRJ-003', 'milestone_slippage', 'Milestone Slippage',
    'medium', 40,
    6, 2, '2 of 5 milestones are delayed or at risk'
  ),
  (
    'PRJ-003', 'cost_escalation', 'Cost Escalation',
    'low', 14,
    3.5, 3, 'Revised cost ₹34,800 Cr vs approved ₹32,500 Cr (+7.1%)'
  ),
  (
    'PRJ-003', 'progress_variance', 'Progress Variance',
    'low', 13,
    3.25, 4, 'Physical progress (88%) is 4.0pp below expected (92%)'
  ),
  (
    'PRJ-003', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 0,
    0, 5, 'Financial progress (87%) vs physical progress (88%) — gap of -1.0pp'
  ),
  (
    'PRJ-004', 'milestone_slippage', 'Milestone Slippage',
    'high', 60,
    9, 1, '3 of 5 milestones are delayed or at risk'
  ),
  (
    'PRJ-004', 'schedule_delay', 'Schedule Delay',
    'medium', 50,
    12.5, 2, 'Project is delayed by 184 days beyond original completion date'
  ),
  (
    'PRJ-004', 'progress_variance', 'Progress Variance',
    'low', 20,
    5, 3, 'Physical progress (52%) is 6.0pp below expected (58%)'
  ),
  (
    'PRJ-004', 'cost_escalation', 'Cost Escalation',
    'low', 15,
    3.75, 4, 'Revised cost ₹51,800 Cr vs approved ₹48,200 Cr (+7.5%)'
  ),
  (
    'PRJ-004', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 0,
    0, 5, 'Financial progress (46%) vs physical progress (52%) — gap of -6.0pp'
  ),
  (
    'PRJ-005', 'schedule_delay', 'Schedule Delay',
    'high', 100,
    25, 1, 'Project is delayed by 547 days beyond original completion date'
  ),
  (
    'PRJ-005', 'milestone_slippage', 'Milestone Slippage',
    'high', 60,
    9, 2, '3 of 5 milestones are delayed or at risk'
  ),
  (
    'PRJ-005', 'cost_escalation', 'Cost Escalation',
    'medium', 30,
    7.5, 3, 'Revised cost ₹13,800 Cr vs approved ₹12,000 Cr (+15.0%)'
  ),
  (
    'PRJ-005', 'progress_variance', 'Progress Variance',
    'low', 23,
    5.75, 4, 'Physical progress (78%) is 7.0pp below expected (85%)'
  ),
  (
    'PRJ-005', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 10,
    1, 5, 'Financial progress (81%) vs physical progress (78%) — gap of 3.0pp'
  ),
  (
    'PRJ-006', 'schedule_delay', 'Schedule Delay',
    'low', 25,
    6.25, 1, 'Project is delayed by 91 days beyond original completion date'
  ),
  (
    'PRJ-006', 'cost_escalation', 'Cost Escalation',
    'low', 5,
    1.25, 2, 'Revised cost ₹27,100 Cr vs approved ₹26,400 Cr (+2.7%)'
  ),
  (
    'PRJ-006', 'progress_variance', 'Progress Variance',
    'low', 0,
    0, 3, 'Physical progress (32%) is -2.0pp below expected (30%)'
  ),
  (
    'PRJ-006', 'milestone_slippage', 'Milestone Slippage',
    'low', 0,
    0, 4, '0 of 4 milestones are delayed or at risk'
  ),
  (
    'PRJ-006', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 0,
    0, 5, 'Financial progress (31%) vs physical progress (32%) — gap of -1.0pp'
  ),
  (
    'PRJ-007', 'schedule_delay', 'Schedule Delay',
    'high', 100,
    25, 1, 'Project is delayed by 549 days beyond original completion date'
  ),
  (
    'PRJ-007', 'milestone_slippage', 'Milestone Slippage',
    'high', 75,
    11.25, 2, '3 of 4 milestones are delayed or at risk'
  ),
  (
    'PRJ-007', 'progress_variance', 'Progress Variance',
    'medium', 33,
    8.25, 3, 'Physical progress (28%) is 10.0pp below expected (38%)'
  ),
  (
    'PRJ-007', 'cost_escalation', 'Cost Escalation',
    'medium', 32,
    8, 4, 'Revised cost ₹45,800 Cr vs approved ₹39,400 Cr (+16.2%)'
  ),
  (
    'PRJ-007', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 10,
    1, 5, 'Financial progress (31%) vs physical progress (28%) — gap of 3.0pp'
  ),
  (
    'PRJ-008', 'schedule_delay', 'Schedule Delay',
    'low', 25,
    6.25, 1, 'Project is delayed by 92 days beyond original completion date'
  ),
  (
    'PRJ-008', 'milestone_slippage', 'Milestone Slippage',
    'low', 20,
    3, 2, '1 of 5 milestones are delayed or at risk'
  ),
  (
    'PRJ-008', 'progress_variance', 'Progress Variance',
    'low', 10,
    2.5, 3, 'Physical progress (62%) is 3.0pp below expected (65%)'
  ),
  (
    'PRJ-008', 'cost_escalation', 'Cost Escalation',
    'low', 6,
    1.5, 4, 'Revised cost ₹19,200 Cr vs approved ₹18,600 Cr (+3.2%)'
  ),
  (
    'PRJ-008', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 3,
    0.3, 5, 'Financial progress (63%) vs physical progress (62%) — gap of 1.0pp'
  ),
  (
    'PRJ-009', 'schedule_delay', 'Schedule Delay',
    'high', 100,
    25, 1, 'Project is delayed by 365 days beyond original completion date'
  ),
  (
    'PRJ-009', 'milestone_slippage', 'Milestone Slippage',
    'high', 75,
    11.25, 2, '3 of 4 milestones are delayed or at risk'
  ),
  (
    'PRJ-009', 'progress_variance', 'Progress Variance',
    'low', 27,
    6.75, 3, 'Physical progress (47%) is 8.0pp below expected (55%)'
  ),
  (
    'PRJ-009', 'cost_escalation', 'Cost Escalation',
    'low', 20,
    5, 4, 'Revised cost ₹15,600 Cr vs approved ₹14,200 Cr (+9.9%)'
  ),
  (
    'PRJ-009', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 0,
    0, 5, 'Financial progress (47%) vs physical progress (47%) — gap of 0.0pp'
  ),
  (
    'PRJ-010', 'schedule_delay', 'Schedule Delay',
    'high', 100,
    25, 1, 'Project is delayed by 731 days beyond original completion date'
  ),
  (
    'PRJ-010', 'milestone_slippage', 'Milestone Slippage',
    'medium', 50,
    7.5, 2, '2 of 4 milestones are delayed or at risk'
  ),
  (
    'PRJ-010', 'progress_variance', 'Progress Variance',
    'low', 27,
    6.75, 3, 'Physical progress (14%) is 8.0pp below expected (22%)'
  ),
  (
    'PRJ-010', 'cost_escalation', 'Cost Escalation',
    'low', 19,
    4.75, 4, 'Revised cost ₹48,900 Cr vs approved ₹44,605 Cr (+9.6%)'
  ),
  (
    'PRJ-010', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 13,
    1.3, 5, 'Financial progress (18%) vs physical progress (14%) — gap of 4.0pp'
  ),
  (
    'PRJ-011', 'schedule_delay', 'Schedule Delay',
    'medium', 50,
    12.5, 1, 'Project is delayed by 183 days beyond original completion date'
  ),
  (
    'PRJ-011', 'milestone_slippage', 'Milestone Slippage',
    'medium', 50,
    7.5, 2, '2 of 4 milestones are delayed or at risk'
  ),
  (
    'PRJ-011', 'progress_variance', 'Progress Variance',
    'low', 10,
    2.5, 3, 'Physical progress (71%) is 3.0pp below expected (74%)'
  ),
  (
    'PRJ-011', 'cost_escalation', 'Cost Escalation',
    'low', 6,
    1.5, 4, 'Revised cost ₹29,400 Cr vs approved ₹28,600 Cr (+2.8%)'
  ),
  (
    'PRJ-011', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 0,
    0, 5, 'Financial progress (69%) vs physical progress (71%) — gap of -2.0pp'
  ),
  (
    'PRJ-012', 'schedule_delay', 'Schedule Delay',
    'high', 75,
    18.75, 1, 'Project is delayed by 273 days beyond original completion date'
  ),
  (
    'PRJ-012', 'milestone_slippage', 'Milestone Slippage',
    'high', 75,
    11.25, 2, '3 of 4 milestones are delayed or at risk'
  ),
  (
    'PRJ-012', 'progress_variance', 'Progress Variance',
    'medium', 47,
    11.75, 3, 'Physical progress (31%) is 14.0pp below expected (45%)'
  ),
  (
    'PRJ-012', 'cost_escalation', 'Cost Escalation',
    'low', 15,
    3.75, 4, 'Revised cost ₹24,100 Cr vs approved ₹22,400 Cr (+7.6%)'
  ),
  (
    'PRJ-012', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 7,
    0.7, 5, 'Financial progress (33%) vs physical progress (31%) — gap of 2.0pp'
  ),
  (
    'PRJ-013', 'schedule_delay', 'Schedule Delay',
    'low', 25,
    6.25, 1, 'Project is delayed by 92 days beyond original completion date'
  ),
  (
    'PRJ-013', 'cost_escalation', 'Cost Escalation',
    'low', 13,
    3.25, 2, 'Revised cost ₹5,100 Cr vs approved ₹4,800 Cr (+6.3%)'
  ),
  (
    'PRJ-013', 'progress_variance', 'Progress Variance',
    'low', 7,
    1.75, 3, 'Physical progress (68%) is 2.0pp below expected (70%)'
  ),
  (
    'PRJ-013', 'milestone_slippage', 'Milestone Slippage',
    'low', 0,
    0, 4, '0 of 3 milestones are delayed or at risk'
  ),
  (
    'PRJ-013', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 0,
    0, 5, 'Financial progress (66%) vs physical progress (68%) — gap of -2.0pp'
  ),
  (
    'PRJ-014', 'schedule_delay', 'Schedule Delay',
    'high', 75,
    18.75, 1, 'Project is delayed by 273 days beyond original completion date'
  ),
  (
    'PRJ-014', 'milestone_slippage', 'Milestone Slippage',
    'high', 75,
    11.25, 2, '3 of 4 milestones are delayed or at risk'
  ),
  (
    'PRJ-014', 'progress_variance', 'Progress Variance',
    'medium', 33,
    8.25, 3, 'Physical progress (62%) is 10.0pp below expected (72%)'
  ),
  (
    'PRJ-014', 'cost_escalation', 'Cost Escalation',
    'low', 25,
    6.25, 4, 'Revised cost ₹8,100 Cr vs approved ₹7,200 Cr (+12.5%)'
  ),
  (
    'PRJ-014', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 13,
    1.3, 5, 'Financial progress (66%) vs physical progress (62%) — gap of 4.0pp'
  ),
  (
    'PRJ-015', 'schedule_delay', 'Schedule Delay',
    'high', 100,
    25, 1, 'Project is delayed by 641 days beyond original completion date'
  ),
  (
    'PRJ-015', 'milestone_slippage', 'Milestone Slippage',
    'high', 75,
    11.25, 2, '3 of 4 milestones are delayed or at risk'
  ),
  (
    'PRJ-015', 'cost_escalation', 'Cost Escalation',
    'medium', 47,
    11.75, 3, 'Revised cost ₹3,950 Cr vs approved ₹3,200 Cr (+23.4%)'
  ),
  (
    'PRJ-015', 'progress_variance', 'Progress Variance',
    'medium', 40,
    10, 4, 'Physical progress (56%) is 12.0pp below expected (68%)'
  ),
  (
    'PRJ-015', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'medium', 30,
    3, 5, 'Financial progress (65%) vs physical progress (56%) — gap of 9.0pp'
  ),
  (
    'PRJ-016', 'schedule_delay', 'Schedule Delay',
    'medium', 50,
    12.5, 1, 'Project is delayed by 184 days beyond original completion date'
  ),
  (
    'PRJ-016', 'milestone_slippage', 'Milestone Slippage',
    'medium', 50,
    7.5, 2, '2 of 4 milestones are delayed or at risk'
  ),
  (
    'PRJ-016', 'progress_variance', 'Progress Variance',
    'low', 17,
    4.25, 3, 'Physical progress (55%) is 5.0pp below expected (60%)'
  ),
  (
    'PRJ-016', 'cost_escalation', 'Cost Escalation',
    'low', 16,
    4, 4, 'Revised cost ₹10,600 Cr vs approved ₹9,800 Cr (+8.2%)'
  ),
  (
    'PRJ-016', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 0,
    0, 5, 'Financial progress (53%) vs physical progress (55%) — gap of -2.0pp'
  ),
  (
    'PRJ-017', 'milestone_slippage', 'Milestone Slippage',
    'high', 75,
    11.25, 1, '3 of 4 milestones are delayed or at risk'
  ),
  (
    'PRJ-017', 'schedule_delay', 'Schedule Delay',
    'medium', 50,
    12.5, 2, 'Project is delayed by 183 days beyond original completion date'
  ),
  (
    'PRJ-017', 'cost_escalation', 'Cost Escalation',
    'low', 27,
    6.75, 3, 'Revised cost ₹26,800 Cr vs approved ₹23,600 Cr (+13.6%)'
  ),
  (
    'PRJ-017', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 20,
    2, 4, 'Financial progress (80%) vs physical progress (74%) — gap of 6.0pp'
  ),
  (
    'PRJ-017', 'progress_variance', 'Progress Variance',
    'low', 13,
    3.25, 5, 'Physical progress (74%) is 4.0pp below expected (78%)'
  ),
  (
    'PRJ-018', 'schedule_delay', 'Schedule Delay',
    'medium', 50,
    12.5, 1, 'Project is delayed by 183 days beyond original completion date'
  ),
  (
    'PRJ-018', 'progress_variance', 'Progress Variance',
    'low', 17,
    4.25, 2, 'Physical progress (30%) is 5.0pp below expected (35%)'
  ),
  (
    'PRJ-018', 'cost_escalation', 'Cost Escalation',
    'low', 14,
    3.5, 3, 'Revised cost ₹33,400 Cr vs approved ₹31,200 Cr (+7.1%)'
  ),
  (
    'PRJ-018', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 3,
    0.3, 4, 'Financial progress (31%) vs physical progress (30%) — gap of 1.0pp'
  ),
  (
    'PRJ-018', 'milestone_slippage', 'Milestone Slippage',
    'low', 0,
    0, 5, '0 of 3 milestones are delayed or at risk'
  ),
  (
    'PRJ-019', 'schedule_delay', 'Schedule Delay',
    'medium', 50,
    12.5, 1, 'Project is delayed by 181 days beyond original completion date'
  ),
  (
    'PRJ-019', 'progress_variance', 'Progress Variance',
    'low', 17,
    4.25, 2, 'Physical progress (27%) is 5.0pp below expected (32%)'
  ),
  (
    'PRJ-019', 'cost_escalation', 'Cost Escalation',
    'low', 17,
    4.25, 3, 'Revised cost ₹67,200 Cr vs approved ₹61,843 Cr (+8.7%)'
  ),
  (
    'PRJ-019', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 7,
    0.7, 4, 'Financial progress (29%) vs physical progress (27%) — gap of 2.0pp'
  ),
  (
    'PRJ-019', 'milestone_slippage', 'Milestone Slippage',
    'low', 0,
    0, 5, '0 of 4 milestones are delayed or at risk'
  ),
  (
    'PRJ-020', 'milestone_slippage', 'Milestone Slippage',
    'high', 75,
    11.25, 1, '3 of 4 milestones are delayed or at risk'
  ),
  (
    'PRJ-020', 'schedule_delay', 'Schedule Delay',
    'medium', 50,
    12.5, 2, 'Project is delayed by 183 days beyond original completion date'
  ),
  (
    'PRJ-020', 'cost_escalation', 'Cost Escalation',
    'low', 17,
    4.25, 3, 'Revised cost ₹9,100 Cr vs approved ₹8,379 Cr (+8.6%)'
  ),
  (
    'PRJ-020', 'progress_variance', 'Progress Variance',
    'low', 10,
    2.5, 4, 'Physical progress (72%) is 3.0pp below expected (75%)'
  ),
  (
    'PRJ-020', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 7,
    0.7, 5, 'Financial progress (74%) vs physical progress (72%) — gap of 2.0pp'
  ),
  (
    'PRJ-021', 'schedule_delay', 'Schedule Delay',
    'high', 100,
    25, 1, 'Project is delayed by 365 days beyond original completion date'
  ),
  (
    'PRJ-021', 'milestone_slippage', 'Milestone Slippage',
    'high', 67,
    10.05, 2, '2 of 3 milestones are delayed or at risk'
  ),
  (
    'PRJ-021', 'cost_escalation', 'Cost Escalation',
    'low', 16,
    4, 3, 'Revised cost ₹82,400 Cr vs approved ₹76,220 Cr (+8.1%)'
  ),
  (
    'PRJ-021', 'progress_variance', 'Progress Variance',
    'low', 13,
    3.25, 4, 'Physical progress (14%) is 4.0pp below expected (18%)'
  ),
  (
    'PRJ-021', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 7,
    0.7, 5, 'Financial progress (16%) vs physical progress (14%) — gap of 2.0pp'
  ),
  (
    'PRJ-022', 'schedule_delay', 'Schedule Delay',
    'high', 75,
    18.75, 1, 'Project is delayed by 273 days beyond original completion date'
  ),
  (
    'PRJ-022', 'milestone_slippage', 'Milestone Slippage',
    'high', 75,
    11.25, 2, '3 of 4 milestones are delayed or at risk'
  ),
  (
    'PRJ-022', 'cost_escalation', 'Cost Escalation',
    'medium', 38,
    9.5, 3, 'Revised cost ₹8,100 Cr vs approved ₹6,809 Cr (+19.0%)'
  ),
  (
    'PRJ-022', 'progress_variance', 'Progress Variance',
    'low', 27,
    6.75, 4, 'Physical progress (64%) is 8.0pp below expected (72%)'
  ),
  (
    'PRJ-022', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 10,
    1, 5, 'Financial progress (67%) vs physical progress (64%) — gap of 3.0pp'
  ),
  (
    'PRJ-023', 'schedule_delay', 'Schedule Delay',
    'high', 100,
    25, 1, 'Project is delayed by 1095 days beyond original completion date'
  ),
  (
    'PRJ-023', 'milestone_slippage', 'Milestone Slippage',
    'high', 60,
    9, 2, '3 of 5 milestones are delayed or at risk'
  ),
  (
    'PRJ-023', 'cost_escalation', 'Cost Escalation',
    'medium', 53,
    13.25, 3, 'Revised cost ₹20,500 Cr vs approved ₹16,216 Cr (+26.4%)'
  ),
  (
    'PRJ-023', 'progress_variance', 'Progress Variance',
    'medium', 43,
    10.75, 4, 'Physical progress (42%) is 13.0pp below expected (55%)'
  ),
  (
    'PRJ-023', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 7,
    0.7, 5, 'Financial progress (44%) vs physical progress (42%) — gap of 2.0pp'
  ),
  (
    'PRJ-024', 'schedule_delay', 'Schedule Delay',
    'high', 100,
    25, 1, 'Project is delayed by 1552 days beyond original completion date'
  ),
  (
    'PRJ-024', 'progress_variance', 'Progress Variance',
    'high', 67,
    16.75, 2, 'Physical progress (52%) is 20.0pp below expected (72%)'
  ),
  (
    'PRJ-024', 'milestone_slippage', 'Milestone Slippage',
    'high', 60,
    9, 3, '3 of 5 milestones are delayed or at risk'
  ),
  (
    'PRJ-024', 'cost_escalation', 'Cost Escalation',
    'medium', 56,
    14, 4, 'Revised cost ₹71,000 Cr vs approved ₹55,548 Cr (+27.8%)'
  ),
  (
    'PRJ-024', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 17,
    1.7, 5, 'Financial progress (57%) vs physical progress (52%) — gap of 5.0pp'
  ),
  (
    'PRJ-025', 'schedule_delay', 'Schedule Delay',
    'high', 100,
    25, 1, 'Project is delayed by 365 days beyond original completion date'
  ),
  (
    'PRJ-025', 'milestone_slippage', 'Milestone Slippage',
    'high', 60,
    9, 2, '3 of 5 milestones are delayed or at risk'
  ),
  (
    'PRJ-025', 'progress_variance', 'Progress Variance',
    'low', 23,
    5.75, 3, 'Physical progress (68%) is 7.0pp below expected (75%)'
  ),
  (
    'PRJ-025', 'cost_escalation', 'Cost Escalation',
    'low', 18,
    4.5, 4, 'Revised cost ₹18,200 Cr vs approved ₹16,700 Cr (+9.0%)'
  ),
  (
    'PRJ-025', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 7,
    0.7, 5, 'Financial progress (70%) vs physical progress (68%) — gap of 2.0pp'
  ),
  (
    'PRJ-026', 'schedule_delay', 'Schedule Delay',
    'high', 100,
    25, 1, 'Project is delayed by 913 days beyond original completion date'
  ),
  (
    'PRJ-026', 'milestone_slippage', 'Milestone Slippage',
    'high', 60,
    9, 2, '3 of 5 milestones are delayed or at risk'
  ),
  (
    'PRJ-026', 'progress_variance', 'Progress Variance',
    'low', 23,
    5.75, 3, 'Physical progress (31%) is 7.0pp below expected (38%)'
  ),
  (
    'PRJ-026', 'cost_escalation', 'Cost Escalation',
    'low', 12,
    3, 4, 'Revised cost ₹31,400 Cr vs approved ₹29,560 Cr (+6.2%)'
  ),
  (
    'PRJ-026', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 0,
    0, 5, 'Financial progress (31%) vs physical progress (31%) — gap of 0.0pp'
  ),
  (
    'PRJ-027', 'cost_escalation', 'Cost Escalation',
    'medium', 40,
    10, 1, 'Revised cost ₹825 Cr vs approved ₹687 Cr (+20.1%)'
  ),
  (
    'PRJ-027', 'schedule_delay', 'Schedule Delay',
    'low', 16,
    4, 2, 'Project is delayed by 59 days beyond original completion date'
  ),
  (
    'PRJ-027', 'progress_variance', 'Progress Variance',
    'low', 0,
    0, 3, 'Physical progress (100%) is 0.0pp below expected (100%)'
  ),
  (
    'PRJ-027', 'milestone_slippage', 'Milestone Slippage',
    'low', 0,
    0, 4, '0 of 3 milestones are delayed or at risk'
  ),
  (
    'PRJ-027', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 0,
    0, 5, 'Financial progress (100%) vs physical progress (100%) — gap of 0.0pp'
  ),
  (
    'PRJ-028', 'schedule_delay', 'Schedule Delay',
    'medium', 50,
    12.5, 1, 'Project is delayed by 183 days beyond original completion date'
  ),
  (
    'PRJ-028', 'progress_variance', 'Progress Variance',
    'low', 17,
    4.25, 2, 'Physical progress (40%) is 5.0pp below expected (45%)'
  ),
  (
    'PRJ-028', 'cost_escalation', 'Cost Escalation',
    'low', 14,
    3.5, 3, 'Revised cost ₹36,500 Cr vs approved ₹34,100 Cr (+7.0%)'
  ),
  (
    'PRJ-028', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 3,
    0.3, 4, 'Financial progress (41%) vs physical progress (40%) — gap of 1.0pp'
  ),
  (
    'PRJ-028', 'milestone_slippage', 'Milestone Slippage',
    'low', 0,
    0, 5, '0 of 3 milestones are delayed or at risk'
  ),
  (
    'PRJ-029', 'schedule_delay', 'Schedule Delay',
    'low', 25,
    6.25, 1, 'Project is delayed by 92 days beyond original completion date'
  ),
  (
    'PRJ-029', 'progress_variance', 'Progress Variance',
    'low', 7,
    1.75, 2, 'Physical progress (70%) is 2.0pp below expected (72%)'
  ),
  (
    'PRJ-029', 'cost_escalation', 'Cost Escalation',
    'low', 7,
    1.75, 3, 'Revised cost ₹18,400 Cr vs approved ₹17,800 Cr (+3.4%)'
  ),
  (
    'PRJ-029', 'milestone_slippage', 'Milestone Slippage',
    'low', 0,
    0, 4, '0 of 4 milestones are delayed or at risk'
  ),
  (
    'PRJ-029', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 0,
    0, 5, 'Financial progress (70%) vs physical progress (70%) — gap of 0.0pp'
  ),
  (
    'PRJ-030', 'schedule_delay', 'Schedule Delay',
    'high', 75,
    18.75, 1, 'Project is delayed by 273 days beyond original completion date'
  ),
  (
    'PRJ-030', 'milestone_slippage', 'Milestone Slippage',
    'high', 67,
    10.05, 2, '2 of 3 milestones are delayed or at risk'
  ),
  (
    'PRJ-030', 'progress_variance', 'Progress Variance',
    'low', 17,
    4.25, 3, 'Physical progress (75%) is 5.0pp below expected (80%)'
  ),
  (
    'PRJ-030', 'cost_escalation', 'Cost Escalation',
    'low', 15,
    3.75, 4, 'Revised cost ₹8,800 Cr vs approved ₹8,200 Cr (+7.3%)'
  ),
  (
    'PRJ-030', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 0,
    0, 5, 'Financial progress (74%) vs physical progress (75%) — gap of -1.0pp'
  ),
  (
    'PRJ-031', 'schedule_delay', 'Schedule Delay',
    'low', 25,
    6.25, 1, 'Project is delayed by 92 days beyond original completion date'
  ),
  (
    'PRJ-031', 'cost_escalation', 'Cost Escalation',
    'low', 11,
    2.75, 2, 'Revised cost ₹5,900 Cr vs approved ₹5,600 Cr (+5.4%)'
  ),
  (
    'PRJ-031', 'progress_variance', 'Progress Variance',
    'low', 10,
    2.5, 3, 'Physical progress (65%) is 3.0pp below expected (68%)'
  ),
  (
    'PRJ-031', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 7,
    0.7, 4, 'Financial progress (67%) vs physical progress (65%) — gap of 2.0pp'
  ),
  (
    'PRJ-031', 'milestone_slippage', 'Milestone Slippage',
    'low', 0,
    0, 5, '0 of 3 milestones are delayed or at risk'
  ),
  (
    'PRJ-032', 'schedule_delay', 'Schedule Delay',
    'medium', 50,
    12.5, 1, 'Project is delayed by 181 days beyond original completion date'
  ),
  (
    'PRJ-032', 'cost_escalation', 'Cost Escalation',
    'low', 14,
    3.5, 2, 'Revised cost ₹3,100 Cr vs approved ₹2,900 Cr (+6.9%)'
  ),
  (
    'PRJ-032', 'progress_variance', 'Progress Variance',
    'low', 13,
    3.25, 3, 'Physical progress (48%) is 4.0pp below expected (52%)'
  ),
  (
    'PRJ-032', 'milestone_slippage', 'Milestone Slippage',
    'low', 0,
    0, 4, '0 of 3 milestones are delayed or at risk'
  ),
  (
    'PRJ-032', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 0,
    0, 5, 'Financial progress (48%) vs physical progress (48%) — gap of 0.0pp'
  ),
  (
    'PRJ-033', 'schedule_delay', 'Schedule Delay',
    'high', 100,
    25, 1, 'Project is delayed by 1370 days beyond original completion date'
  ),
  (
    'PRJ-033', 'cost_escalation', 'Cost Escalation',
    'high', 83,
    20.75, 2, 'Revised cost ₹8,200 Cr vs approved ₹5,796 Cr (+41.5%)'
  ),
  (
    'PRJ-033', 'milestone_slippage', 'Milestone Slippage',
    'high', 67,
    10.05, 3, '2 of 3 milestones are delayed or at risk'
  ),
  (
    'PRJ-033', 'progress_variance', 'Progress Variance',
    'medium', 47,
    11.75, 4, 'Physical progress (28%) is 14.0pp below expected (42%)'
  ),
  (
    'PRJ-033', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 27,
    2.7, 5, 'Financial progress (36%) vs physical progress (28%) — gap of 8.0pp'
  ),
  (
    'PRJ-034', 'schedule_delay', 'Schedule Delay',
    'medium', 50,
    12.5, 1, 'Project is delayed by 183 days beyond original completion date'
  ),
  (
    'PRJ-034', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 13,
    1.3, 2, 'Financial progress (42%) vs physical progress (38%) — gap of 4.0pp'
  ),
  (
    'PRJ-034', 'cost_escalation', 'Cost Escalation',
    'low', 12,
    3, 3, 'Revised cost ₹4,450 Cr vs approved ₹4,200 Cr (+6.0%)'
  ),
  (
    'PRJ-034', 'progress_variance', 'Progress Variance',
    'low', 7,
    1.75, 4, 'Physical progress (38%) is 2.0pp below expected (40%)'
  ),
  (
    'PRJ-034', 'milestone_slippage', 'Milestone Slippage',
    'low', 0,
    0, 5, '0 of 3 milestones are delayed or at risk'
  ),
  (
    'PRJ-035', 'schedule_delay', 'Schedule Delay',
    'high', 75,
    18.75, 1, 'Project is delayed by 273 days beyond original completion date'
  ),
  (
    'PRJ-035', 'milestone_slippage', 'Milestone Slippage',
    'high', 60,
    9, 2, '3 of 5 milestones are delayed or at risk'
  ),
  (
    'PRJ-035', 'progress_variance', 'Progress Variance',
    'low', 13,
    3.25, 3, 'Physical progress (82%) is 4.0pp below expected (86%)'
  ),
  (
    'PRJ-035', 'cost_escalation', 'Cost Escalation',
    'low', 13,
    3.25, 4, 'Revised cost ₹38,500 Cr vs approved ₹36,230 Cr (+6.3%)'
  ),
  (
    'PRJ-035', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 0,
    0, 5, 'Financial progress (77%) vs physical progress (82%) — gap of -5.0pp'
  ),
  (
    'PRJ-036', 'milestone_slippage', 'Milestone Slippage',
    'high', 67,
    10.05, 1, '2 of 3 milestones are delayed or at risk'
  ),
  (
    'PRJ-036', 'schedule_delay', 'Schedule Delay',
    'medium', 50,
    12.5, 2, 'Project is delayed by 181 days beyond original completion date'
  ),
  (
    'PRJ-036', 'progress_variance', 'Progress Variance',
    'low', 7,
    1.75, 3, 'Physical progress (88%) is 2.0pp below expected (90%)'
  ),
  (
    'PRJ-036', 'cost_escalation', 'Cost Escalation',
    'low', 4,
    1, 4, 'Revised cost ₹4,100 Cr vs approved ₹4,026 Cr (+1.8%)'
  ),
  (
    'PRJ-036', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 0,
    0, 5, 'Financial progress (87%) vs physical progress (88%) — gap of -1.0pp'
  ),
  (
    'PRJ-037', 'schedule_delay', 'Schedule Delay',
    'high', 75,
    18.75, 1, 'Project is delayed by 274 days beyond original completion date'
  ),
  (
    'PRJ-037', 'milestone_slippage', 'Milestone Slippage',
    'medium', 50,
    7.5, 2, '2 of 4 milestones are delayed or at risk'
  ),
  (
    'PRJ-037', 'cost_escalation', 'Cost Escalation',
    'low', 19,
    4.75, 3, 'Revised cost ₹6,800 Cr vs approved ₹6,200 Cr (+9.7%)'
  ),
  (
    'PRJ-037', 'progress_variance', 'Progress Variance',
    'low', 10,
    2.5, 4, 'Physical progress (82%) is 3.0pp below expected (85%)'
  ),
  (
    'PRJ-037', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 0,
    0, 5, 'Financial progress (82%) vs physical progress (82%) — gap of 0.0pp'
  ),
  (
    'PRJ-038', 'schedule_delay', 'Schedule Delay',
    'medium', 50,
    12.5, 1, 'Project is delayed by 181 days beyond original completion date'
  ),
  (
    'PRJ-038', 'progress_variance', 'Progress Variance',
    'low', 7,
    1.75, 2, 'Physical progress (22%) is 2.0pp below expected (24%)'
  ),
  (
    'PRJ-038', 'cost_escalation', 'Cost Escalation',
    'low', 4,
    1, 3, 'Revised cost ₹93,000 Cr vs approved ₹91,000 Cr (+2.2%)'
  ),
  (
    'PRJ-038', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 3,
    0.3, 4, 'Financial progress (23%) vs physical progress (22%) — gap of 1.0pp'
  ),
  (
    'PRJ-038', 'milestone_slippage', 'Milestone Slippage',
    'low', 0,
    0, 5, '0 of 3 milestones are delayed or at risk'
  ),
  (
    'PRJ-039', 'milestone_slippage', 'Milestone Slippage',
    'high', 67,
    10.05, 1, '2 of 3 milestones are delayed or at risk'
  ),
  (
    'PRJ-039', 'schedule_delay', 'Schedule Delay',
    'medium', 50,
    12.5, 2, 'Project is delayed by 181 days beyond original completion date'
  ),
  (
    'PRJ-039', 'cost_escalation', 'Cost Escalation',
    'low', 8,
    2, 3, 'Revised cost ₹7,500 Cr vs approved ₹7,200 Cr (+4.2%)'
  ),
  (
    'PRJ-039', 'progress_variance', 'Progress Variance',
    'low', 7,
    1.75, 4, 'Physical progress (94%) is 2.0pp below expected (96%)'
  ),
  (
    'PRJ-039', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'low', 0,
    0, 5, 'Financial progress (94%) vs physical progress (94%) — gap of 0.0pp'
  ),
  (
    'PRJ-040', 'schedule_delay', 'Schedule Delay',
    'high', 100,
    25, 1, 'Project is delayed by 547 days beyond original completion date'
  ),
  (
    'PRJ-040', 'milestone_slippage', 'Milestone Slippage',
    'high', 75,
    11.25, 2, '3 of 4 milestones are delayed or at risk'
  ),
  (
    'PRJ-040', 'cost_escalation', 'Cost Escalation',
    'medium', 43,
    10.75, 3, 'Revised cost ₹5,100 Cr vs approved ₹4,200 Cr (+21.4%)'
  ),
  (
    'PRJ-040', 'expenditure_progress_mismatch', 'Expenditure–Progress Mismatch',
    'medium', 40,
    4, 4, 'Financial progress (66%) vs physical progress (54%) — gap of 12.0pp'
  ),
  (
    'PRJ-040', 'progress_variance', 'Progress Variance',
    'medium', 37,
    9.25, 5, 'Physical progress (54%) is 11.0pp below expected (65%)'
  )
) as values_table(
  project_code, driver_code, name, impact, value, weighted_contribution, rank, description
)
join public.projects on projects.project_code = values_table.project_code
join public.project_risks risks on risks.project_id = projects.id and risks.is_current
where not exists (
  select 1 from public.risk_drivers existing
  where existing.risk_id = risks.id and existing.driver_code = values_table.driver_code
);

insert into public.predictions (
  project_id, model_version_id, source_update_id, prediction_type,
  horizon_months, target_date, predicted_value, predicted_class, confidence,
  output_payload, feature_snapshot, generated_at, valid_until, metadata
)
select
  projects.id,
  model_versions.id,
  updates.id,
  'risk_score',
  3,
  (values_table.generated_at::date + interval '3 months')::date,
  least(100, values_table.current_score + 5),
  values_table.risk_level,
  70,
  jsonb_build_object('basis', 'seeded deterministic trend', 'currentScore', values_table.current_score),
  values_table.feature_snapshot,
  values_table.generated_at,
  values_table.generated_at + interval '3 months',
  '{"seed":true,"synthetic":true,"notProductionML":true}'::jsonb
from (values
  (
    'PRJ-015', 61,
    'high_risk', '2026-04-25T00:00:00Z'::timestamptz,
    '{"physicalProgress":56,"plannedProgress":68,"financialProgress":65,"delayDays":641}'::jsonb
  ),
  (
    'PRJ-024', 66,
    'high_risk', '2026-04-29T00:00:00Z'::timestamptz,
    '{"physicalProgress":52,"plannedProgress":72,"financialProgress":57,"delayDays":1552}'::jsonb
  ),
  (
    'PRJ-033', 70,
    'high_risk', '2026-04-26T00:00:00Z'::timestamptz,
    '{"physicalProgress":28,"plannedProgress":42,"financialProgress":36,"delayDays":1370}'::jsonb
  ),
  (
    'PRJ-040', 60,
    'high_risk', '2026-04-27T00:00:00Z'::timestamptz,
    '{"physicalProgress":54,"plannedProgress":65,"financialProgress":66,"delayDays":547}'::jsonb
  )
) as values_table(project_code, current_score, risk_level, generated_at, feature_snapshot)
join public.projects on projects.project_code = values_table.project_code
join public.model_versions on model_versions.name = 'pragati_x_deterministic_risk'
  and model_versions.version = '1.0.0'
left join lateral (
  select monthly.id
  from public.project_monthly_updates monthly
  where monthly.project_id = projects.id
  order by monthly.reporting_month desc
  limit 1
) updates on true
where not exists (
  select 1 from public.predictions existing
  where existing.project_id = projects.id
    and existing.model_version_id = model_versions.id
    and existing.prediction_type = 'risk_score'
    and existing.generated_at = values_table.generated_at
);

insert into public.warnings (
  warning_code, project_id, risk_id, severity, status, alert_type, title,
  description, trigger_rule, source_type, source_reference, deduplication_key,
  evidence, detected_at, assigned_to_name, metadata
)
select
  values_table.warning_code,
  projects.id,
  risks.id,
  values_table.severity::public.warning_severity,
  values_table.status::public.warning_status,
  values_table.alert_type,
  values_table.title,
  values_table.description,
  values_table.trigger_rule,
  'rule',
  'frontend-demo-warning',
  values_table.warning_code,
  values_table.evidence,
  values_table.detected_at,
  values_table.assigned_to_name,
  '{"seed":true,"synthetic":true}'::jsonb
from (values
  (
    'WRN-001', 'PRJ-001', 'critical',
    'assigned', 'Cost Overrun', 'Cost Escalation Exceeds Monitoring Threshold',
    'Project cost has escalated by ₹17,500 Cr (15.9%) beyond the approved estimate, breaching the 15% escalation threshold set for Category-A projects.', 'Revised cost exceeds approved cost by more than 15%', '["Approved cost: ₹1,10,000 Cr | Revised cost: ₹1,27,500 Cr","Previous revision (Oct 2025): ₹1,21,000 Cr — second revision in 8 months","Major drivers: tunnel design changes (+₹4,200 Cr), Japanese equipment cost overrun (+₹3,800 Cr)","NHSRCL Board approval for revision pending as of 30 Apr 2026"]'::jsonb,
    '2026-04-15T00:00:00Z'::timestamptz, 'Joint Secretary, MoR'
  ),
  (
    'WRN-002', 'PRJ-001', 'critical',
    'under_review', 'Progress Variance', 'Physical Progress Significantly Below Planned Trajectory',
    'Physical progress stands at 34% against an expected 52%, a variance of −18 percentage points. Current pace suggests further schedule slippage.', 'Progress variance exceeds −15 percentage points', '["Physical progress: 34% | Expected: 52% | Variance: −18pp","Viaduct completion rate: 2.3 km/month against target of 4.1 km/month","TBM deployment delayed due to geological surprises in Boisar zone","Only 3 of 6 planned TBMs currently operational"]'::jsonb,
    '2026-04-22T00:00:00Z'::timestamptz, 'Director (Projects), NHSRCL'
  ),
  (
    'WRN-003', 'PRJ-024', 'critical',
    'assigned', 'Schedule Delay', 'Schedule Delay Exceeds 1,500 Days',
    'Polavaram project is now delayed by 1,552 days from its original completion date of December 2022. Revised target of March 2027 is also at risk.', 'Schedule delay exceeds 1000 days', '["Original completion: Dec 2022 | Current revised target: Mar 2027","Delay: 1,552 days (4.25 years)","Earth dam completion still pending; cofferdam overtopped in flood seasons 2023 and 2024","Resettlement of 1.82 lakh families — 78% completed","Cost revised from ₹55,548 Cr to ₹71,000 Cr (+27.8%)"]'::jsonb,
    '2026-03-01T00:00:00Z'::timestamptz, 'Additional Secretary, MoJS'
  ),
  (
    'WRN-004', 'PRJ-023', 'high',
    'acknowledged', 'Milestone Slippage', 'Milestone Completion Significantly Behind Planned Progress',
    'Only 2 of 5 tracked milestones completed; 3 are delayed or at risk. Physical progress at 42% against expected 55%.', 'More than 50% of milestones in Delayed or At Risk status', '["5 tracked milestones: 2 completed, 2 delayed, 1 at risk","Physical progress: 42% | Expected: 55% | Gap: −13pp","Tunnel T-7 facing geological challenges — quartzite rock harder than anticipated","Target tunneling rate: 8 m/day | Achieved: 5.2 m/day","Cost escalated by ₹4,284 Cr (+26.4%)"]'::jsonb,
    '2026-04-18T00:00:00Z'::timestamptz, 'GM (Construction), RVNL'
  ),
  (
    'WRN-005', 'PRJ-033', 'high',
    'new', 'Expenditure Mismatch', 'Expenditure-Progress Mismatch Detected',
    'Financial progress (36%) significantly exceeds physical progress (28%), indicating potential expenditure without corresponding physical output.', 'Financial progress exceeds physical progress by more than 5 percentage points', '["Financial progress: 36% | Physical progress: 28% | Mismatch: +8pp","Expenditure: ₹2,100 Cr against revised cost of ₹8,200 Cr","Major expenditure on land compensation (₹680 Cr) with no physical output","Foundation works not yet commenced despite multiple deferrals"]'::jsonb,
    '2026-04-20T00:00:00Z'::timestamptz, null
  ),
  (
    'WRN-006', 'PRJ-010', 'high',
    'new', 'Progress Variance', 'Physical Progress Significantly Below Expected Trajectory',
    'Physical progress (14%) is 8pp below expected (22%). Project timeline of 2028 is at risk if current pace continues.', 'Progress variance exceeds −5 percentage points for national priority projects', '["Physical progress: 14% | Expected: 22% | Variance: −8pp","Dam foundation works yet to begin despite contract award in Mar 2025","Forest land diversion of 9,000 ha pending final handover in 6 districts","Contractor mobilisation at Daudhan dam site: 40% of planned machinery"]'::jsonb,
    '2026-04-25T00:00:00Z'::timestamptz, null
  ),
  (
    'WRN-007', 'PRJ-040', 'high',
    'under_review', 'Dual Risk', 'Cost Escalation and Schedule Delay — Dual Risk',
    'Project faces both cost escalation (+21.4%) and schedule delay (547 days), placing it in the dual-risk category requiring monitoring review.', 'Combined cost escalation >10% AND schedule delay >180 days', '["Approved cost: ₹4,200 Cr | Revised: ₹5,100 Cr (+21.4%)","Delay: 547 days; new target June 2027","Geological report revision added 1.8 km of additional support tunneling","Financial progress (66%) significantly exceeds physical progress (54%)"]'::jsonb,
    '2026-04-10T00:00:00Z'::timestamptz, 'Project Director, NHIDCL'
  ),
  (
    'WRN-008', 'PRJ-007', 'moderate',
    'acknowledged', 'Progress Variance', 'Progress Variance Approaching Threshold',
    'Physical progress (28%) is 10pp behind expected (38%). If current rate persists, project may enter High Risk category within 60 days.', 'Progress variance between −8pp and −15pp — approaching threshold', '["Physical progress: 28% | Expected: 38% | Variance: −10pp","Reactor building Unit 5: 25% structural completion against 38% plan","Delay in Russian equipment (reactor internals) due to logistics constraints","Cost escalated: +16.2% (₹39,400 Cr to ₹45,800 Cr)"]'::jsonb,
    '2026-04-28T00:00:00Z'::timestamptz, null
  ),
  (
    'WRN-009', 'PRJ-012', 'moderate',
    'new', 'Implementation Lag', 'Implementation Pace Below Contracted Milestone',
    'GP connectivity rate of 31% against expected 45% indicates contractor deployment gaps in difficult terrain areas.', 'Progress variance exceeds −10pp for communication infrastructure', '["Physical progress: 31% | Expected: 45% | Variance: −14pp","Only 5,200 GPs connected against 5,000 GP contracted milestone for Q4 FY25","Underground cable laying hampered by riverine terrain in West Bengal delta","Contractor has mobilised only 60% of planned deployment teams"]'::jsonb,
    '2026-04-20T00:00:00Z'::timestamptz, null
  ),
  (
    'WRN-010', 'PRJ-005', 'moderate',
    'new', 'Seasonal Risk', 'Seasonal Risk — Construction Window Narrowing',
    'With 22% work remaining and only one summer construction season available, project is at risk of missing revised target of June 2026.', 'Seasonal risk flag for high-altitude mountain projects', '["Physical progress: 78% | Expected: 85% | Variance: −7pp","Remaining high-altitude tunneling: ~12 km across 3 locations","Construction season: May–October 2026 — only window available","Weather delays accounted for 140 days of total delay"]'::jsonb,
    '2026-04-29T00:00:00Z'::timestamptz, null
  ),
  (
    'WRN-011', 'PRJ-026', 'moderate',
    'acknowledged', 'Repeat Schedule Revision', 'Schedule Reset for Third Time',
    'Project has undergone third schedule revision. Current delay of 913 days from original target warrants escalated monitoring.', 'Third or subsequent schedule revision detected', '["Original target: Sep 2024 | Current target: Mar 2027 | Delay: 913 days","Schedule revisions: Sep 2024 → Dec 2025 → Sep 2026 → Mar 2027","Land acquisition completed after 5 revisions (2019–2023)","Runway earthwork still in progress 18 months after contract award"]'::jsonb,
    '2026-04-05T00:00:00Z'::timestamptz, null
  ),
  (
    'WRN-012', 'PRJ-015', 'high',
    'new', 'Dual Risk', 'Cost Escalation and Significant Progress Deficit',
    'Cost has escalated 23.4% while physical progress (56%) lags behind expected (68%), resulting in elevated risk classification.', 'Cost escalation >15% AND progress variance > −10pp simultaneously', '["Approved: ₹3,200 Cr | Revised: ₹3,950 Cr | Escalation: +23.4%","Physical progress: 56% | Expected: 68% | Variance: −12pp","Financial progress (65%) far exceeds physical (56%) — possible billing mismatch","Delay of 641 days — longest delay among education sector projects"]'::jsonb,
    '2026-04-12T00:00:00Z'::timestamptz, null
  )
) as values_table(
  warning_code, project_code, severity, status, alert_type, title, description,
  trigger_rule, evidence, detected_at, assigned_to_name
)
join public.projects on projects.project_code = values_table.project_code
left join public.project_risks risks on risks.project_id = projects.id and risks.is_current
on conflict (warning_code) do update set
  project_id = excluded.project_id,
  risk_id = excluded.risk_id,
  severity = excluded.severity,
  status = excluded.status,
  alert_type = excluded.alert_type,
  title = excluded.title,
  description = excluded.description,
  trigger_rule = excluded.trigger_rule,
  evidence = excluded.evidence,
  detected_at = excluded.detected_at,
  assigned_to_name = excluded.assigned_to_name;

insert into public.interventions (
  intervention_code, project_id, warning_id, ministry_id, issue,
  recommended_action, priority, status, assigned_to_name, due_date,
  opened_at, resolved_at, notes, metadata
)
select
  values_table.intervention_code,
  projects.id,
  warning_match.id,
  projects.ministry_id,
  values_table.issue,
  values_table.recommended_action,
  values_table.priority::public.intervention_priority,
  values_table.status::public.intervention_status,
  values_table.assigned_to_name,
  values_table.due_date,
  values_table.opened_at,
  values_table.resolved_at,
  values_table.notes,
  '{"seed":true,"synthetic":true}'::jsonb
from (values
  (
    'INT-001', 'PRJ-001', 'Cost escalation exceeding threshold; physical progress at 18pp below expected trajectory',
    'Convene inter-ministerial review chaired by Railway Minister; NHSRCL to present revised cost estimate with corrective action plan within 30 days', 'critical',
    'assigned', 'Joint Secretary, Ministry of Railways',
    '2026-05-31'::date, '2026-04-15'::date,
    null, 'Third escalation review in 18 months. Prior corrective plan of Oct 2025 not fully implemented.'
  ),
  (
    'INT-002', 'PRJ-024', 'Delay of 1,552 days with cost overrun of 27.8%. Earth dam completion at risk before monsoon.',
    'Emergency site visit by Secretary, Jal Shakti; coordinate with AP government for pre-monsoon cofferdam strengthening measures by 15 May 2026.', 'critical',
    'in_progress', 'Additional Secretary, Ministry of Jal Shakti',
    '2026-05-15'::date, '2026-03-01'::date,
    null, 'Inter-state water dispute between Andhra Pradesh, Telangana and Odisha remains unresolved.'
  ),
  (
    'INT-003', 'PRJ-023', 'Tunneling pace at 64% of target; geological surprises requiring design modifications',
    'RVNL to engage international geological expert for updated boring trajectory; increase TBM fleet from current 8 to 12 machines for critical tunnels.', 'high',
    'open', null,
    '2026-06-30'::date, '2026-04-18'::date,
    null, null
  ),
  (
    'INT-004', 'PRJ-033', 'Expenditure-progress mismatch of 8pp; foundation works not commenced despite 36% financial progress',
    'Conduct expenditure audit; direct UJVN to submit item-wise physical progress mapping against expenditure within 21 days.', 'high',
    'open', null,
    '2026-05-20'::date, '2026-04-20'::date,
    null, null
  ),
  (
    'INT-005', 'PRJ-010', 'Physical progress at 14% against expected 22%; forest land diversion pending',
    'Secretary-level meeting with MoEF to expedite forest clearance; NWDA to accelerate contractor mobilisation for Daudhan dam site.', 'high',
    'assigned', 'Director General, NWDA',
    '2026-06-15'::date, '2026-04-25'::date,
    null, null
  ),
  (
    'INT-006', 'PRJ-012', 'Progress variance of −14pp; contractor deployment gaps identified in riverine terrain',
    'DoT to issue show-cause to implementing agency; consider rebidding of problematic packages in West Bengal delta region.', 'moderate',
    'open', null,
    '2026-07-01'::date, '2026-04-20'::date,
    null, null
  ),
  (
    'INT-007', 'PRJ-007', 'Russian equipment delays affecting reactor building construction schedule',
    'DAE to initiate diplomatic channel for logistics clearance; explore alternate sea route via Iran for equipment shipment.', 'high',
    'assigned', 'CMD, NPCIL',
    '2026-05-30'::date, '2026-04-28'::date,
    null, null
  ),
  (
    'INT-008', 'PRJ-040', 'Dual risk — cost overrun 21.4% and delay 547 days; financial progress exceeds physical',
    'Independent technical audit of tunnel boring methodology; review billing structure with contractor to align financial claims with physical output.', 'high',
    'in_progress', 'Project Director, NHIDCL (J&K)',
    '2026-05-31'::date, '2026-04-10'::date,
    null, 'Strategic importance: J&K connectivity. Monitoring frequency increased to fortnightly.'
  ),
  (
    'INT-009', 'PRJ-015', 'Cost escalation 23.4% with financial progress (65%) exceeding physical (56%)',
    'UGC quality monitoring team to conduct site inspection; CPWD to reconcile financial and physical progress figures with certified measurements.', 'moderate',
    'open', null,
    '2026-06-30'::date, '2026-04-12'::date,
    null, null
  ),
  (
    'INT-010', 'PRJ-005', 'Only one construction season remaining; 22% work pending in high-altitude zones',
    'BRO to deploy additional tunnel teams by 1 May 2026; create 24×7 work schedule for accessible segments during construction window.', 'high',
    'assigned', 'Chief Engineer, BRO Project Shivalik',
    '2026-05-01'::date, '2026-04-29'::date,
    null, null
  ),
  (
    'INT-011', 'PRJ-003', 'System commissioning delayed by 90 days due to signalling equipment procurement',
    'Fast-track procurement from approved vendor list; accept interim manual operations protocol.', 'moderate',
    'resolved', 'MD, DFCCIL',
    '2026-03-31'::date, '2026-01-15'::date,
    '2026-04-10T00:00:00Z'::timestamptz, 'Signalling equipment procurement completed. System testing underway.'
  ),
  (
    'INT-012', 'PRJ-027', 'Final civil finishing works delayed due to winter road closures',
    'BRO to deploy winter-weather capable finishing teams; coordinate with Army for temporary access.', 'moderate',
    'resolved', 'Project Director, BRO',
    '2024-02-28'::date, '2023-11-01'::date,
    '2024-02-28T00:00:00Z'::timestamptz, 'Project successfully completed and inaugurated in February 2024.'
  )
) as values_table(
  intervention_code, project_code, issue, recommended_action, priority,
  status, assigned_to_name, due_date, opened_at, resolved_at, notes
)
join public.projects on projects.project_code = values_table.project_code
left join lateral (
  select warnings.id
  from public.warnings
  where warnings.project_id = projects.id
  order by warnings.detected_at
  limit 1
) warning_match on true
on conflict (intervention_code) do update set
  project_id = excluded.project_id,
  warning_id = excluded.warning_id,
  ministry_id = excluded.ministry_id,
  issue = excluded.issue,
  recommended_action = excluded.recommended_action,
  priority = excluded.priority,
  status = excluded.status,
  assigned_to_name = excluded.assigned_to_name,
  due_date = excluded.due_date,
  opened_at = excluded.opened_at,
  resolved_at = excluded.resolved_at,
  notes = excluded.notes;

insert into public.intervention_updates (
  intervention_id, update_type, status, note, occurred_at, metadata
)
select
  interventions.id,
  'seed_snapshot',
  interventions.status,
  coalesce(interventions.notes, 'Initial intervention state imported from the frontend demonstration dataset.'),
  interventions.created_at,
  '{"seed":true,"synthetic":true}'::jsonb
from public.interventions
where interventions.metadata ->> 'seed' = 'true'
  and not exists (
    select 1 from public.intervention_updates existing
    where existing.intervention_id = interventions.id
      and existing.update_type = 'seed_snapshot'
  );

insert into public.audit_logs (
  action, entity_type, table_name, record_key, new_values, occurred_at
)
select
  'seed_import',
  'dataset',
  'projects',
  'pragati-x-demo-v1',
  jsonb_build_object(
    'projects', (select count(*) from public.projects where metadata ->> 'seed' = 'true'),
    'warnings', (select count(*) from public.warnings where metadata ->> 'seed' = 'true'),
    'interventions', (select count(*) from public.interventions where metadata ->> 'seed' = 'true')
  ),
  now()
where not exists (
  select 1 from public.audit_logs where record_key = 'pragati-x-demo-v1' and action = 'seed_import'
);

-- Profiles are created by the auth.users trigger. Documents and notifications
-- intentionally remain empty until real Storage objects and authenticated users exist.

commit;
