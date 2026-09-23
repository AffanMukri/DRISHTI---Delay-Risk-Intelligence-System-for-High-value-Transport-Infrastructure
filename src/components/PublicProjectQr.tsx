import { ExternalLink, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { publicProjectUrl } from '../services/publicProjectService';

interface PublicProjectQrProps {
  projectId: string;
  projectName: string;
}

export function PublicProjectQr({ projectId, projectName }: PublicProjectQrProps) {
  const url = publicProjectUrl(projectId);
  return (
    <div className="flex shrink-0 items-center gap-3 rounded-xl border border-teal-200 bg-gradient-to-br from-white to-teal-50 p-2.5 shadow-sm">
      <div className="rounded-md border border-slate-200 bg-white p-1.5" title={`Public QR for ${projectName}`}>
        <QRCodeSVG value={url} size={70} level="M" marginSize={0} fgColor="#123f49" bgColor="#ffffff" />
      </div>
      <div className="hidden max-w-[130px] xl:block">
        <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-teal-800"><QrCode className="h-3.5 w-3.5" /> Public project QR</p>
        <p className="mt-1 text-[10px] leading-4 text-slate-500">Share approved basic facts without workspace access.</p>
        <a href={url} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-navy-800 hover:text-teal-700">Preview public page <ExternalLink className="h-3 w-3" /></a>
      </div>
    </div>
  );
}
