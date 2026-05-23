# Security Specification: CubeSat Mission Control Firebase Integration

## 1. Data Invariants
- **Log Entry Integrity**: Individual logs are strictly write-once records and can never be modified or deleted once logged. They must always map to valid fields and valid debug/info/warn/error levels.
- **Telemetry Series Continuity**: Telemetry entries must have consistent shapes, valid timestamps (`time`), and values bounded within safe ranges (e.g. Battery percentage must be between 0 and 100). They cannot be modified or deleted by ground control terminals.
- **Active Operational State Consistency**: The `cubesat_status` contains the single active state of the satellite. Only authorized ground control commands can update the attitude status of variables like `roll`, `pitch`, `yaw`, battery charging commands, or anomaly modifiers.

---

## 2. The "Dirty Dozen" Payloads (Anti-Analysis)
The following 12 JSON payloads describe malicious or corrupted write attempts. The Firestore security rules must block these:

### Attack 1: Deleting historic flight logs
- **Payload/Action**: Delete document on `/logs/log_id`
- **Goal**: Cover up terminal command execution.
- **Expected Outcome**: `PERMISSION_DENIED`

### Attack 2: Tampering with a logged warning level
- **Payload/Action**: Update `level` on `/logs/log_id` to "INFO"
- **Goal**: Minimize structural anomalies flags.
- **Expected Outcome**: `PERMISSION_DENIED`

### Attack 3: Spoofing negative battery levels
- **Payload/Action**: Create `/telemetry_history/item_id` with `{"battery": -50}`
- **Goal**: Cause an internal application crash or out-of-range sensor crash.
- **Expected Outcome**: `PERMISSION_DENIED`

### Attack 4: Overflowing battery percentage past bounds
- **Payload/Action**: Create `/telemetry_history/item_id` with `{"battery": 500}`
- **Goal**: Corrupt active battery state trackers.
- **Expected Outcome**: `PERMISSION_DENIED`

### Attack 5: Unauthenticated write to live status
- **Payload/Action**: Update `/cubesat_status/latest` while not logged in.
- **Goal**: Inject unauthorized orbital maneuvers.
- **Expected Outcome**: `PERMISSION_DENIED`

### Attack 6: Arbitrary key insertion (Shadow Fields)
- **Payload/Action**: Create `/logs/log_id` with `{"ghost_variable": "injected_backdoor", "level": "INFO", "message": "Test", "timestamp": "12:00:00"}`
- **Goal**: Bypass key constraints or store arbitrary files.
- **Expected Outcome**: `PERMISSION_DENIED`

### Attack 7: Modifying immutable metadata fields
- **Payload/Action**: Update `/telemetry_history/item_id` with `{"vcc": 12.0}` where `createdAt` timestamp is modified.
- **Goal**: Manipulate physical calibration metrics in historical analysis.
- **Expected Outcome**: `PERMISSION_DENIED`

### Attack 8: Injecting extremely long ID values (Denial of Wallet)
- **Payload/Action**: Create a log document with high-byte custom ID string (size > 128 characters).
- **Goal**: Inflate index size and deplete database quota.
- **Expected Outcome**: `PERMISSION_DENIED`

### Attack 9: Spoil attitude variables with text objects
- **Payload/Action**: Update `/cubesat_status/latest` with `{"roll": "dangerous_string"}`
- **Goal**: Explode calculations in the 3D Three.js renderer space.
- **Expected Outcome**: `PERMISSION_DENIED`

### Attack 10: State shortcutting anomaly triggers
- **Payload/Action**: Update status to transition to terminal/unconfigured state.
- **Goal**: Disrupt telemetry loop.
- **Expected Outcome**: `PERMISSION_DENIED`

### Attack 11: Spoofing current server time
- **Payload/Action**: Inject `createdAt` as a hardcoded static client date in the past.
- **Goal**: Avoid real-time UTC alignment.
- **Expected Outcome**: `PERMISSION_DENIED`

### Attack 12: Erasing the entire telemetry collection
- **Payload/Action**: Bulk delete on `/telemetry_history`
- **Goal**: Destabilize scientific data delivery.
- **Expected Outcome**: `PERMISSION_DENIED`

---

## 3. Test Runner Specification
Tests are set up to verify these conditions against our deployed security rules. A typical tester file (`firestore.rules.test.ts`) would execute these test blocks using the Firebase rules emulator.
