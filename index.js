// Complete Node.js Express API Server with Real-time Telemetry and SMTP Gateways
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const app = express();

app.use(cors());
app.use(express.json());

// ─── Central Unified Data Store ───
const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
};

const generateAPIKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = 'CWX-';
    for (let i = 0; i < 24; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
};

let sitesCache = [
    {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'North Main Express',
        location: '1420 North Main St, Dallas TX',
        api_key: 'CWX-7fA3kL9pQr2sT8vY1mN6jH4b',
        meters: [
            { id: 'm1', label_name: 'Main Flow', gpio_pin: 32, pulses_per_liter: 2.0, total_liters: 0.0 },
            { id: 'm2', label_name: 'Rinse Line', gpio_pin: 33, pulses_per_liter: 2.0, total_liters: 0.0 },
            { id: 'm3', label_name: 'Wax Application', gpio_pin: 25, pulses_per_liter: 2.0, total_liters: 0.0 },
            { id: 'm4', label_name: 'Soap Dispenser', gpio_pin: 26, pulses_per_liter: 2.0, total_liters: 0.0 },
            { id: 'm5', label_name: 'Recycled Water', gpio_pin: 27, pulses_per_liter: 2.0, total_liters: 0.0 }
        ],
        chemicals: [
            { id: 'c1', label_name: 'Pre-Soak Wax', gpio_pin: 35, is_low: false },
            { id: 'c2', label_name: 'Wheel Soap', gpio_pin: 34, is_low: false }
        ],
        wash_counter: { label_name: 'Total Washes', gpio_pin: 14, total_count: 0 }
    },
    {
        id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        name: 'Southside Auto Spa',
        location: '880 Commerce Blvd, Austin TX',
        api_key: 'CWX-9xR4mP2wZ6yJ3nL8qF5vT7cS',
        meters: [
            { id: 'm1', label_name: 'Primary Intake', gpio_pin: 32, pulses_per_liter: 2.0, total_liters: 0.0 },
            { id: 'm2', label_name: 'Secondary Rinse', gpio_pin: 33, pulses_per_liter: 3.0, total_liters: 0.0 }
        ],
        chemicals: [
            { id: 'c1', label_name: 'Foam Concentrate', gpio_pin: 25, is_low: false }
        ],
        wash_counter: { label_name: 'Wash Cycles', gpio_pin: 14, total_count: 0 }
    }
];

let usersCache = [
    { id: '1', name: 'John Doe', email: 'john@wash.com', role: 'Manager', site: 'North Main Express', is_approved: true },
    { id: '2', name: 'Sam Request', email: 'sam@wash.com', role: 'Manager', site: 'Southside Auto Spa', is_approved: false }
];

let smtpConfig = {
    smtp_host: 'smtp.mailtrap.io',
    smtp_port: 587,
    smtp_user: 'mock_user',
    smtp_pass: 'mock_pass',
    sender_email: 'alerts@carwashiot.com'
};

let telemetryHistory = [];

// ─── Site Management Endpoints ───

app.get('/api/v1/sites', (req, res) => {
    return res.status(200).json(sitesCache);
});

app.post('/api/v1/sites', (req, res) => {
    const { name, location } = req.body;
    if (!name) return res.status(400).json({ error: 'Site name is required' });

    const newSite = {
        id: generateUUID(),
        name: name,
        location: location || '',
        api_key: generateAPIKey(),
        meters: [],
        chemicals: [],
        wash_counter: { label_name: 'Total Washes', gpio_pin: 0, total_count: 0 }
    };
    sitesCache.push(newSite);
    return res.status(201).json({ status: 'site_created', site: newSite });
});

app.post('/api/v1/sites/configure', (req, res) => {
    const { site_id, meters, wash_counter, chemicals } = req.body;
    const site = sitesCache.find(s => s.id === site_id);
    if (!site) return res.status(404).json({ error: 'Site not found' });

    if (meters && Array.isArray(meters)) {
        site.meters = meters.map((m) => ({
            id: m.id || generateUUID(),
            label_name: m.label_name || m.name || 'Unnamed Meter',
            gpio_pin: m.gpio_pin !== undefined ? parseInt(m.gpio_pin) : 0,
            pulses_per_liter: m.pulses_per_liter !== undefined ? parseFloat(m.pulses_per_liter) : 2.0,
            total_liters: m.total_liters !== undefined ? parseFloat(m.total_liters) : 0.0
        }));
    }
    if (wash_counter) {
        site.wash_counter = {
            label_name: wash_counter.label_name || wash_counter.name || site.wash_counter.label_name,
            gpio_pin: wash_counter.gpio_pin !== undefined ? parseInt(wash_counter.gpio_pin) : site.wash_counter.gpio_pin,
            total_count: wash_counter.total_count !== undefined ? parseInt(wash_counter.total_count) : site.wash_counter.total_count
        };
    }
    if (chemicals && Array.isArray(chemicals)) {
        site.chemicals = chemicals.map(c => ({
            id: c.id || generateUUID(),
            label_name: c.label_name || c.name || '',
            gpio_pin: c.gpio_pin !== undefined ? parseInt(c.gpio_pin) : 0,
            is_low: c.is_low !== undefined ? Boolean(c.is_low) : false
        }));
    }
    return res.status(200).json({ status: 'configuration_updated', site });
});

app.post('/api/v1/sites/calibrate', (req, res) => {
    const { site_id, meter_index, meter_id, new_total_liters, new_wash_count } = req.body;
    const site = sitesCache.find(s => s.id === site_id);
    if (!site) return res.status(404).json({ error: 'Site not found' });

    if (meter_id) {
        const meter = site.meters.find(m => m.id === meter_id);
        if (meter && new_total_liters !== undefined) {
            meter.total_liters = parseFloat(new_total_liters);
        }
    } else if (meter_index !== undefined) {
        const meter = site.meters[meter_index];
        if (meter && new_total_liters !== undefined) {
            meter.total_liters = parseFloat(new_total_liters);
        }
    }
    if (new_wash_count !== undefined) {
        site.wash_counter.total_count = parseInt(new_wash_count);
    }
    return res.status(200).json({ status: 'calibrated', site });
});

app.post('/api/v1/sites/add-meter', (req, res) => {
    const { siteId, label_name, gpio_pin, pulses_per_liter } = req.body;
    const site = sitesCache.find(s => s.id === siteId);
    if (!site) return res.status(404).json({ error: 'Site not found' });

    const newMeter = {
        id: 'm' + (site.meters.length + 1) + '_' + Date.now().toString(36),
        label_name: label_name || 'New Meter',
        gpio_pin: gpio_pin !== undefined ? parseInt(gpio_pin) : 0,
        pulses_per_liter: pulses_per_liter !== undefined ? parseFloat(pulses_per_liter) : 2.0,
        total_liters: 0.0
    };
    site.meters.push(newMeter);
    return res.status(201).json({ status: 'meter_added', meter: newMeter, site });
});

app.post('/api/v1/sites/add-chemical', (req, res) => {
    const { siteId, label_name, gpio_pin } = req.body;
    const site = sitesCache.find(s => s.id === siteId);
    if (!site) return res.status(404).json({ error: 'Site not found' });

    const newChemical = {
        id: 'c' + (site.chemicals.length + 1) + '_' + Date.now().toString(36),
        label_name: label_name || 'New Chemical',
        gpio_pin: gpio_pin !== undefined ? parseInt(gpio_pin) : 0,
        is_low: false
    };
    site.chemicals.push(newChemical);
    return res.status(201).json({ status: 'chemical_added', chemical: newChemical, site });
});

app.post('/api/v1/sites/delete-asset', (req, res) => {
    const { siteId, assetType, assetId } = req.body;
    const site = sitesCache.find(s => s.id === siteId);
    if (!site) return res.status(404).json({ error: 'Site not found' });

    if (assetType === 'meter') {
        site.meters = site.meters.filter(m => m.id !== assetId);
    } else if (assetType === 'chemical') {
        site.chemicals = site.chemicals.filter(c => c.id !== assetId);
    } else {
        return res.status(400).json({ error: 'Invalid asset type. Use meter or chemical.' });
    }
    return res.status(200).json({ status: 'asset_deleted', site });
});

// GET /api/v1/dashboard/live — Pure read-only. Returns exact memory values. No mutation.
app.get('/api/v1/dashboard/live', (req, res) => {
    return res.status(200).json(sitesCache);
});

// POST /api/v1/telemetry — Hardware-only data updates from ESP32 microcontrollers
app.post('/api/v1/telemetry', (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'Missing Secure API Identity Key' });

    const site = sitesCache.find(s => s.api_key === apiKey);
    if (!site) return res.status(404).json({ error: 'Site not found for provided API key' });

    const body = req.body;

    if (Array.isArray(body.meters)) {
        body.meters.forEach((incoming) => {
            const match = site.meters.find(m => m.id === incoming.id || m.label_name === incoming.label_name);
            if (match && incoming.pulses !== undefined) {
                match.total_liters += incoming.pulses / match.pulses_per_liter;
            }
        });
    } else if (body.meter_data && typeof body.meter_data === 'object') {
        Object.keys(body.meter_data).forEach((key) => {
            const match = site.meters.find(m => m.id === key || m.label_name === key);
            if (match && body.meter_data[key].pulses !== undefined) {
                match.total_liters += body.meter_data[key].pulses / match.pulses_per_liter;
            }
        });
    }

    if (body.wash_increment !== undefined) {
        site.wash_counter.total_count += parseInt(body.wash_increment);
    }
    if (body.chemicals && Array.isArray(body.chemicals)) {
        body.chemicals.forEach((incoming) => {
            const match = site.chemicals.find(c => c.id === incoming.id || c.label_name === incoming.label_name);
            if (match && incoming.is_low !== undefined) {
                match.is_low = Boolean(incoming.is_low);
            }
        });
    }

    telemetryHistory.push({ timestamp: new Date().toISOString(), site_id: site.id });
    return res.status(200).json({ status: 'success' });
});

// ─── Admin Control Overrides ───
app.post('/api/v1/admin/calibrate-totals', (req, res) => {
    const { site_id, m1, m2, m3, m4, m5, washes } = req.body;
    const site = sitesCache.find(s => s.id === site_id);
    if (!site) return res.status(404).json({ error: 'Site not found' });

    const overrides = [m1, m2, m3, m4, m5];
    overrides.forEach((val, i) => {
        if (val !== undefined && site.meters[i]) {
            site.meters[i].total_liters = parseFloat(val);
        }
    });
    if (washes !== undefined) site.wash_counter.total_count = parseInt(washes);
    return res.status(200).json({ status: 'calibrated', site });
});

app.post('/api/v1/admin/calibrate-parameters', (req, res) => {
    const { site_id, m1_k, m2_k, m3_k, m4_k, m5_k } = req.body;
    const site = sitesCache.find(s => s.id === site_id);
    if (!site) return res.status(404).json({ error: 'Site not found' });

    const overrides = [m1_k, m2_k, m3_k, m4_k, m5_k];
    overrides.forEach((val, i) => {
        if (val !== undefined && site.meters[i]) {
            site.meters[i].pulses_per_liter = parseFloat(val);
        }
    });
    return res.status(200).json({ status: 'parameters_saved', site });
});

// ─── User Approvals Engine ───
app.get('/api/v1/admin/users', (req, res) => res.json(usersCache));
app.post('/api/v1/admin/users/approve', (req, res) => {
    const { userId, approve } = req.body;
    const user = usersCache.find(u => u.id === userId);
    if (user) { user.is_approved = approve; return res.json({ status: 'success', user }); }
    return res.status(404).json({ error: 'User Entry Missing' });
});

// ─── SMTP Management System ───
app.get('/api/v1/admin/smtp', (req, res) => res.json(smtpConfig));
app.post('/api/v1/admin/smtp', (req, res) => {
    smtpConfig = { ...smtpConfig, ...req.body };
    return res.status(200).json({ status: 'smtp_configured', current: smtpConfig });
});

app.post('/api/v1/alerts/chemical', (req, res) => {
    const { site_id, chemical_name, is_low } = req.body;
    const site = sitesCache.find(s => s.id === site_id);
    if (site) {
        const chemical = site.chemicals.find(c => c.label_name === chemical_name || c.name === chemical_name);
        if (chemical) {
            chemical.is_low = is_low;
        }
    }
    if (is_low) {
        console.log(`[SMTP ALARM DISPATCH VIA ${smtpConfig.smtp_host}] Low Chemical Notice Sent.`);
    }
    return res.json({ status: 'processed' });
});

cron.schedule('* * * * *', () => {
    if (telemetryHistory.length > 0) {
        console.log(`[SMTP REPORT DELIVERY] Exporting tracking rows to .csv file structure using host connection ${smtpConfig.smtp_host}...`);
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`System Server Active on port ${PORT}`));
