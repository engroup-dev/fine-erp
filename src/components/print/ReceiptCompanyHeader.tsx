import React from "react";
import { printContactLine, printRegistrationLine, usePrintProfile } from "../../hooks/useCompanyProfile";

/**
 * W6-02: the company lines at the top of every 80mm receipt — the logo (only when the
 * profile has one), the legal name, then the tax / commercial register and address / phone
 * lines when filled in. With an empty profile it prints the old hard-coded name alone.
 */
export const ReceiptCompanyHeader: React.FC = () => {
  const profile = usePrintProfile();
  const registration = printRegistrationLine(profile);
  const contact = printContactLine(profile);
  return (
    <>
      {profile.customLogo && (
        <img src={profile.customLogo} alt="" className="mx-auto h-12 w-auto max-w-[60%] object-contain" />
      )}
      <h2 className="text-sm font-bold tracking-wider font-sans">{profile.name}</h2>
      {registration && <p className="text-[10px] text-gray-600 font-sans">{registration}</p>}
      {contact && <p className="text-[10px] text-gray-600 font-sans">{contact}</p>}
    </>
  );
};

/**
 * W6-02: the closing lines of a customer receipt — the profile's receipt footer when set,
 * else `fallback` (the text the receipt printed before), else nothing.
 */
export const ReceiptFooter: React.FC<{ fallback?: React.ReactNode }> = ({ fallback }) => {
  const { receiptFooter } = usePrintProfile();
  if (!receiptFooter && !fallback) return null;
  return (
    <div className="text-center text-[10px] text-gray-500 pt-1 space-y-0.5 font-sans">
      {receiptFooter ? <p className="whitespace-pre-line">{receiptFooter}</p> : fallback}
    </div>
  );
};
