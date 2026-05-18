-- PostgreSQL Database Configuration
CREATE TABLE IF NOT EXISTS sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    api_key VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hardware_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    device_type VARCHAR(50) NOT NULL, -- 'water_meter', 'chemical_float', 'wash_counter'
    label_name VARCHAR(100) NOT NULL,
    hardware_gpio_pin INT NOT NULL,
    pulses_per_liter NUMERIC(10, 4) DEFAULT 2.0000 -- Scalable parameter (e.g. 2 pulses = 1 Liter)
);

CREATE TABLE IF NOT EXISTS current_totals (
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE PRIMARY KEY,
    meter_1_total NUMERIC(12, 2) DEFAULT 0.0,
    meter_2_total NUMERIC(12, 2) DEFAULT 0.0,
    meter_3_total NUMERIC(12, 2) DEFAULT 0.0,
    meter_4_total NUMERIC(12, 2) DEFAULT 0.0,
    meter_5_total NUMERIC(12, 2) DEFAULT 0.0,
    wash_total INT DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telemetry_logs (
    id BIGSERIAL PRIMARY KEY,
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    meter_1_liters NUMERIC(12, 2) DEFAULT 0.0,
    meter_2_liters NUMERIC(12, 2) DEFAULT 0.0,
    meter_3_liters NUMERIC(12, 2) DEFAULT 0.0,
    meter_4_liters NUMERIC(12, 2) DEFAULT 0.0,
    meter_5_liters NUMERIC(12, 2) DEFAULT 0.0,
    wash_increment INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chemical_status (
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    chemical_label VARCHAR(100) NOT NULL,
    is_low BOOLEAN DEFAULT FALSE,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (site_id, chemical_label)
);

CREATE TABLE IF NOT EXISTS reporting_schedules (
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE PRIMARY KEY,
    recipient_emails TEXT NOT NULL,
    daily_time TIME NOT NULL DEFAULT '20:00:00',
    monthly_day INT NOT NULL DEFAULT 1,
    monthly_time TIME NOT NULL DEFAULT '06:00:00'
);

CREATE TABLE IF NOT EXISTS smtp_settings (
    id INT PRIMARY KEY DEFAULT 1, -- Forces strict single row system settings configuration
    smtp_host VARCHAR(255) NOT NULL,
    smtp_port INT NOT NULL DEFAULT 587,
    smtp_user VARCHAR(255) NOT NULL,
    smtp_pass VARCHAR(255) NOT NULL,
    sender_email VARCHAR(255) NOT NULL,
    encryption_type VARCHAR(50) DEFAULT 'STARTTLS',
    CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) DEFAULT 'Manager', -- 'Admin' or 'Manager'
    assigned_site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
    is_approved BOOLEAN DEFAULT FALSE, -- Admin Gate Approval Flag
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
