-- SQLite schema for the Shared Bill Splitter

-- HOMES TABLE
CREATE TABLE homes (
    id TEXT NOT NULL PRIMARY KEY,  -- UUID generated in code
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,      -- ISO string generated in code

    CONSTRAINT chk_homes_name_not_empty CHECK (length(trim(name)) > 0)
);

-- MEMBERS TABLE
CREATE TABLE members (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,  -- order members were added (used for split + balances)
    id TEXT NOT NULL UNIQUE,                -- UUID generated in code, used by the API
    home_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,               -- ISO string generated in code

    CONSTRAINT uq_members_home_id UNIQUE (home_id, id),
    CONSTRAINT fk_members_home FOREIGN KEY (home_id) REFERENCES homes(id),
    CONSTRAINT chk_members_name_not_empty CHECK (length(trim(name)) > 0)
);
CREATE INDEX idx_members_home_id ON members(home_id);

-- BILLS TABLE
CREATE TABLE bills (
    id TEXT NOT NULL PRIMARY KEY,  -- UUID generated in code
    home_id TEXT NOT NULL,
    title TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL,      -- ISO string generated in code

    CONSTRAINT uq_bills_home_id UNIQUE (home_id, id),
    CONSTRAINT fk_bills_home FOREIGN KEY (home_id) REFERENCES homes(id),
    CONSTRAINT chk_bills_total_positive CHECK (typeof(total_cents) = 'integer' AND total_cents > 0),
    CONSTRAINT chk_bills_title_not_empty CHECK (length(trim(title)) > 0)
);

-- SHARES TABLE
CREATE TABLE shares (
    id TEXT NOT NULL PRIMARY KEY,  -- UUID generated in code
    home_id TEXT NOT NULL,
    bill_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    paid_at TEXT,                  -- ISO string set when paid; NULL = unpaid
    idempotency_key TEXT,          -- from the client's Idempotency-Key header; NULL until paid
    created_at TEXT NOT NULL,      -- ISO string generated in code

    CONSTRAINT fk_shares_bill   FOREIGN KEY (home_id, bill_id)   REFERENCES bills(home_id, id),
    CONSTRAINT fk_shares_member FOREIGN KEY (home_id, member_id) REFERENCES members(home_id, id),
    CONSTRAINT uq_shares_bill_member UNIQUE (bill_id, member_id),
    CONSTRAINT chk_shares_amount_non_negative CHECK (typeof(amount_cents) = 'integer' AND amount_cents >= 0),
    CONSTRAINT chk_shares_paid_consistent CHECK (
        (paid_at IS NULL AND idempotency_key IS NULL) OR
        (paid_at IS NOT NULL AND idempotency_key IS NOT NULL)
    ),
    CONSTRAINT chk_shares_paid_at_format CHECK (
        paid_at IS NULL OR
        paid_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
    )
);
CREATE INDEX idx_shares_member_id ON shares(member_id);
