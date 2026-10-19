# Manshi Group Of Services — Invoice Generator

A complete, professional, local-first invoice management web application built for **Manshi Group Of Services**, matching the exact visual layout, typography, colors, and structure of `Brushspace.pdf`.

---

## Features

- **Exact Document Reproduction**:
  - A4 portrait layout.
  - Authentic **Trebuchet MS** typography at **8.5 pt** body size.
  - Faithful reproduction of the company header, "INVOICE" heading, "Bill To :-" section, items table, subtotal, payment terms, bank details, "SCAN AND PAY" QR code, and footer greeting.
  - Selectable-text, vector PDF generation using `jsPDF` with bundled TrueType fonts.
- **Local-First & Offline Ready (IndexedDB via Dexie.js)**:
  - All company settings, invoices, numbering sequences, and uploaded images persist securely in browser IndexedDB.
  - Zero external backends, cloud databases, or paid APIs required.
  - Data survives browser refreshes and restarts.
- **Indian Financial Year & Strict Sequence Tracking**:
  - Automatically calculates Indian Financial Year (April 1 to March 31).
  - Starts sequence from `MGS/2026-27/079`.
  - Deleting an invoice never releases or reuses its invoice number.
  - Editable starting sequence number in Settings.
- **Live A4 Preview & Browser Printing**:
  - Dual-pane layout on desktop with real-time updates.
  - Dedicated print stylesheet (`@media print`) for clean browser printing without dashboard UI.
- **Invoice History & Management**:
  - Search by customer name or invoice number.
  - Full-screen invoice preview modal.
  - One-click PDF download.
  - Duplicate invoice into a new draft with a fresh invoice number.
  - Safe deletion with accounting integrity warnings.
- **Backup & Restore**:
  - One-click JSON backup export and restore.
  - Warning notices regarding browser site data clearing.

---

## Technology Stack

- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Vanilla CSS (Executive Slate / Navy design system)
- **Database**: Dexie.js (IndexedDB)
- **PDF Engine**: jsPDF with embedded Trebuchet MS TrueType fonts
- **Icons**: Lucide React

---

## Getting Started

### 1. Install Dependencies
```powershell
npm install
```

### 2. Run Development Server
```powershell
npm run dev
```
The application will start at `http://localhost:5173/`.

### 3. Build for Production
```powershell
npm run build
```

---

## Project Structure

```
├── public/
│   ├── assets/
│   │   ├── logo.png          # Manshi Group logo extracted from reference PDF
│   │   └── qr_scanner.jpg    # Payment scanner QR extracted from reference PDF
│   └── fonts/
│       ├── trebuc.ttf        # Trebuchet MS Regular TrueType font
│       ├── trebucbd.ttf      # Trebuchet MS Bold TrueType font
│       ├── trebucbi.ttf      # Trebuchet MS Bold Italic TrueType font
│       └── trebucit.ttf      # Trebuchet MS Italic TrueType font
├── src/
│   ├── components/
│   │   ├── common/           # Toast alerts, ConfirmModal, BackupModal
│   │   ├── invoice/          # InvoiceDocument (HTML/CSS A4 preview & print)
│   │   └── layout/           # AppLayout (Sidebar, Topbar, DB status)
│   ├── db/                   # IndexedDB schema, sequence lock, backup export/import
│   ├── pages/
│   │   ├── CreateInvoicePage.tsx
│   │   ├── InvoiceHistoryPage.tsx
│   │   └── SettingsPage.tsx
│   ├── types/                # TypeScript interfaces
│   ├── utils/                # Financial year calculation & jsPDF generator
│   ├── App.tsx
│   └── index.css             # Executive design system tokens & styles
├── Brushspace.pdf            # Original reference invoice
└── package.json
```

---

## License

Built for **Manshi Group Of Services**. All rights reserved.
