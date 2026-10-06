# Extraits de code des modules

Ces extraits courts illustrent le rôle des modules présents dans l’application. Les commentaires décrivent chaque extrait ; les chemins indiquent le code source correspondant.

## 1. Authentification (connexion et inscription)
Source : `apps/backend/src/auth/auth.controller.ts`

```ts
// Délègue au service la création du compte et l'ouverture de session.
register(@Body() body: { email?: string; password?: string; nom?: string }) {
  return this.auth.register({
    email: body.email ?? '',
    password: body.password ?? '',
    nom: body.nom,
  });
}

// Authentifie l'utilisateur à partir de son identifiant et de son mot de passe.
login(@Body() body: { identifier?: string; password?: string }) {
  return this.auth.login(body.identifier ?? '', body.password ?? '');
}
```

## 2. Front-Office citoyen
Source : `apps/frontend/src/App.tsx`

```tsx
// Le citoyen accède à ses démarches, documents, notifications et rendez-vous.
<Route path="/front/*" element={
  <RequireCitizen>
    <AppLayout variant="frontoffice">
      <Routes>
        <Route path="accueil" element={<CitizenDashboardPage />} />
        <Route path="demandes" element={<RequestPage />} />
        <Route path="documents" element={<CitizenDocumentsPage />} />
        <Route path="rendez-vous" element={<AppointmentsPage />} />
      </Routes>
    </AppLayout>
  </RequireCitizen>
} />
```

## 3. Back-Office administrateur
Source : `apps/frontend/src/App.tsx`

```tsx
// Le garde vérifie le rôle avant d'afficher les outils de gestion.
<Route path="/back/*" element={
  <RequireRoles roles={['ADMIN']}>
    <AppLayout variant="backoffice">
      <Routes>
        <Route path="accueil" element={<AdminDashboardPage />} />
        <Route path="workflow" element={<AdminWorkflowPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="modeles" element={<AdminDocumentTemplatesPage />} />
      </Routes>
    </AppLayout>
  </RequireRoles>
} />
```

## 4. Gestion des demandes
Source : `apps/backend/src/requests/requests.service.ts`

```ts
// Contrôle les champs métier avant d'enregistrer la demande.
this.validateFormData(data.type, data.formData ?? {});
const service = await this.prisma.prefectureService.findUnique({
  where: { id: data.serviceId },
});
if (!service) throw new NotFoundException('Service introuvable');
```

## 5. Formulaires dynamiques
Source : `apps/frontend/src/pages/RequestPage.tsx`

```tsx
// Les champs sont construits à partir des exigences du type de démarche choisi.
{formFields.map((field) => (
  <label className="request-field" key={field.name}>
    {t(field.label)}{field.required ? ' *' : ''}
    <input
      type={field.type}
      required={field.required}
      value={formData[field.name] ?? ''}
      onChange={(event) => {
        setFormData((previous) => ({ ...previous, [field.name]: event.target.value }));
        setFieldErrors((previous) => ({ ...previous, [field.name]: '' }));
      }}
    />
  </label>
))}
```

## 6. Upload de pièces
Source : `apps/backend/src/requests/requests.controller.ts`

```ts
// Reçoit les pièces avec les métadonnées du formulaire en multipart.
@UseInterceptors(FilesInterceptor('attachments', 30, {
  dest: process.env.UPLOAD_DIR ?? './uploads',
}))
// Le contrôleur transmet les fichiers reçus au service de demande.
@UploadedFiles() files: Array<{ path: string; originalname: string; mimetype?: string; size?: number }>
```

## 7. Génération de documents
Source : `apps/backend/src/requests/requests.service.ts`

```ts
// Le document approuvé est complété puis ajouté au modèle PDF officiel choisi.
const templatePdf = await EditablePDFDocument.load(readFileSync(model.path));
const detailsPdf = await EditablePDFDocument.load(Buffer.concat(chunks));
const pages = await templatePdf.copyPages(detailsPdf, detailsPdf.getPageIndices());
pages.forEach((page) => templatePdf.addPage(page));
resolve(Buffer.from(await templatePdf.save()));
```

## 8. Cachet et signature
Source : `apps/backend/src/requests/requests.service.ts`

```ts
// Seuls les cachets et signatures activés sont pris en compte à la génération.
const marks = await this.prisma.officialMark.findMany({
  where: { isActive: true, kind: { in: ['STAMP', 'SIGNATURE'] } },
});
const signature = marks.find((mark) => mark.kind === 'SIGNATURE');
if (signature && existsSync(signature.storagePath)) {
  document.image(signature.storagePath, { fit: [140, 80], align: 'right' });
}
```

## 9. Paiement (simulation)
Source : `apps/backend/src/requests/requests.service.ts`

```ts
// La simulation vérifie le PIN avant de confirmer le paiement du dossier.
if (payment) {
  if (!/^\d{4}$/.test(payment.simulationPin) || payment.simulationPin !== SIMULATED_PAYMENT_PIN) {
    throw new BadRequestException('Code PIN de simulation incorrect. Utilisez le code de démonstration affiché.');
  }
}
// Le paiement confirmé est enregistré avec la demande.
```

## 10. Rendez-vous
Source : `apps/backend/src/appointments/appointments.service.ts`

```ts
// Chaque réservation dure 30 minutes et un créneau passé est refusé.
const startsAt = new Date(input.startsAt);
if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
  throw new ConflictException('Créneau invalide');
}
const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
const conflict = await this.prisma.appointment.findFirst({
  where: {
    status: AppointmentStatus.BOOKED,
    startsAt: { lt: endsAt },
    endsAt: { gt: startsAt },
  },
});
if (conflict) throw new ConflictException('Ce créneau est déjà réservé');
```

## 11. Chatbot IA
Source : `apps/backend/src/rag/rag.service.ts`

```ts
// Les réponses sont cadrées sur les démarches préfectorales et la langue détectée.
const prompt = [
  'Tu es l’assistant officiel de l’e-Servisy.',
  language === 'mg'
    ? 'Valiny amin’ny teny malagasy ihany. Valio amin’ny teny malagasy mitovy amin’ny fanontaniana; aza mamaly amin’ny teny frantsay.'
    : 'Réponds exclusivement en français, comme la question. Ne bascule pas en malgache.',
  `Question : ${question}`,
  `Contexte :\n${contexte || '(aucun résultat)'}`,
].join('\n\n');
```

## 12. Notifications
Source : `apps/backend/src/notifications/notifications.service.ts`

```ts
// Crée une notification personnelle pour l'utilisateur concerné.
async createForUser(userId: string, title: string, message: string) {
  return this.prisma.notification.create({
    data: { userId, title, message, channel: 'PUSH' },
  });
}
```

## 13. Traduction Français / Malagasy
Source : `apps/frontend/src/translations.ts`

```ts
// Le dictionnaire choisit la langue et conserve les variables de texte.
export function translateText(language: AppLanguage, text: string, values?) {
  const translated = language === 'mg'
    ? malagasy[text] ?? text
    : frenchLabels[text] ?? text;
  return values
    ? translated.replace(/\{\{(\w+)\}\}/g, (_match, key) => String(values[key] ?? ''))
    : translated;
}
```

## 14. Gestion des rôles (citoyen / administrateur)
Source : `apps/backend/src/auth/roles.guard.ts`

```ts
// Autorise l'accès si l'utilisateur possède l'un des rôles exigés.
if (request.user?.roles?.some((role) => requiredRoles.includes(role))) return true;
if (request.user?.role === 'ADMIN' && requiredRoles.includes('ADMIN')) return true;
throw new ForbiddenException('Permissions insuffisantes');
```

## 15. Dashboard administrateur
Source : `apps/frontend/src/pages/AdminDashboardPage.tsx`

```tsx
// Affiche les indicateurs et charge la liste filtrée des demandes.
const { data: stats } = useQuery({
  queryKey: ['admin-stats'],
  queryFn: adminService.getStats,
});
const { data: requests = [] } = useQuery({
  queryKey: ['admin-dashboard-requests', filter],
  queryFn: () => adminService.listRequests(filter),
});
```

## 16. Paramètres / profil
Source : `apps/frontend/src/pages/CitizenProfilePage.tsx`

```tsx
// Le profil mis à jour est répercuté dans la session de l'utilisateur.
const result = await authService.updateProfile({ nom, email, phone, cin });
updateUser(result.user as AuthUser);
setMessage(t('Votre profil a été mis à jour.'));
```
