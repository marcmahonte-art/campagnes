'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { InlineError } from '@/components/ui/feedback';
import { backend } from '@/lib/backend';
import {
  REPORT_LIMITS,
  REPORT_REASONS,
  checkAttachment,
  isReportReason,
} from '@/lib/reports';

/**
 * Formulaire de signalement.
 *
 * La validation faite ici n'est qu'un confort : elle évite un aller-retour
 * inutile. La validation qui compte est en base, dans `submit_report`
 * (migration 0010) — un formulaire public se contourne toujours côté navigateur.
 */
export function ReportForm() {
  const [reason, setReason] = useState('');
  const [campaignUrl, setCampaignUrl] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  function onPickFile(selected: File | undefined) {
    setFileError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    const problem = checkAttachment(selected);
    if (problem) {
      setFileError(problem);
      setFile(null);
      return;
    }
    setFile(selected);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!isReportReason(reason)) {
      setError('Choisissez un motif.');
      return;
    }
    if (description.trim().length < REPORT_LIMITS.descriptionMin) {
      setError(`Décrivez le problème en au moins ${REPORT_LIMITS.descriptionMin} caractères.`);
      return;
    }
    if (campaignUrl.trim().length > REPORT_LIMITS.urlMax) {
      setError('Le lien de la campagne est trop long.');
      return;
    }
    if (!email.trim()) {
      setError('Indiquez une adresse email pour que nous puissions vous répondre.');
      return;
    }
    if (file) {
      const problem = checkAttachment(file);
      if (problem) {
        setFileError(problem);
        return;
      }
    }

    setPending(true);
    try {
      let attachmentPath: string | null = null;
      if (file) {
        const uploaded = await backend.uploadReportAttachment(file);
        if (uploaded.error) throw new Error(uploaded.error);
        attachmentPath = uploaded.data ?? null;
      }

      const result = await backend.submitReport({
        reason,
        campaignUrl: campaignUrl.trim(),
        description: description.trim(),
        email: email.trim(),
        attachmentPath,
      });
      if (result.error) throw new Error(result.error);

      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'envoi n'a pas abouti. Réessayez dans un instant.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div
        role="status"
        className="flex flex-col items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-6"
      >
        <CheckCircle2 className="size-6 text-ink" strokeWidth={1.75} aria-hidden />
        <p className="text-[15px] font-semibold text-ink">Votre signalement a bien été envoyé.</p>
        <p className="text-[14px] leading-relaxed text-gray-600">
          Merci de nous aider à améliorer Campagnes. Nous examinons chaque signalement.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate={false}>
      <Field label="Motif" htmlFor="report-reason">
        <Select
          id="report-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="">Sélectionner</option>
          {REPORT_REASONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Lien de la campagne"
        htmlFor="report-url"
        hint="L’adresse de la page concernée, si vous l’avez. Facultatif."
      >
        <Input
          id="report-url"
          type="url"
          inputMode="url"
          value={campaignUrl}
          onChange={(e) => setCampaignUrl(e.target.value)}
          placeholder="https://campagnes.app/c/…"
        />
      </Field>

      <Field
        label="Description"
        htmlFor="report-description"
        hint={`Ce que vous constatez, en ${REPORT_LIMITS.descriptionMin} caractères minimum.`}
      >
        <Textarea
          id="report-description"
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={REPORT_LIMITS.descriptionMax}
          placeholder="Décrivez le problème…"
          required
        />
      </Field>

      <Field
        label="Email"
        htmlFor="report-email"
        hint="Pour vous répondre. Il n’est pas publié."
      >
        <Input
          id="report-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="votre@adresse.com"
          required
        />
      </Field>

      <Field
        label="Pièce jointe"
        htmlFor="report-file"
        hint="Facultatif. PNG, JPEG, WebP ou PDF, 5 Mo maximum."
        error={fileError ?? undefined}
      >
        <input
          id="report-file"
          type="file"
          accept={REPORT_LIMITS.attachmentTypes.join(',')}
          onChange={(e) => onPickFile(e.target.files?.[0])}
          className="w-full rounded-md border border-gray-200 bg-white px-4 py-2.5 text-[14px] text-gray-700 file:mr-3 file:rounded-pill file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-ink"
        />
      </Field>

      <div className="flex flex-col gap-4">
        <Button type="submit" variant="primary" size="lg" disabled={pending} className="self-start">
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Envoi…
            </>
          ) : (
            'Envoyer le signalement'
          )}
        </Button>

        <InlineError>{error}</InlineError>
      </div>
    </form>
  );
}
