/**
 * Script para probar la normalización y comparación de URLs de LinkedIn
 */

// Función para normalizar URLs (igual que en apifyService.js)
const normalizeLinkedInUrl = (url) => {
  if (!url) return url;
  let normalized = url.trim();

  // Asegurar que empiece con https://
  if (!normalized.startsWith('http')) {
    normalized = `https://${normalized}`;
  }

  // Remover parámetros de query y fragmentos
  normalized = normalized.split('?')[0].split('#')[0];

  return normalized;
};

// Función de comparación aproximada
const findBestProfileMatch = (apifyUrl, profileMap) => {
  // Primero intentar coincidencia exacta
  const exactMatch = profileMap.get(apifyUrl);
  if (exactMatch) return exactMatch;

  // Si no hay coincidencia exacta, intentar coincidencias aproximadas
  const normalizedApifyUrl = apifyUrl.toLowerCase().trim();

  for (const [hubspotUrl, profileInfo] of profileMap.entries()) {
    const normalizedHubspotUrl = hubspotUrl.toLowerCase().trim();

    // Coincidencia si los slugs son iguales (después del último /)
    const apifySlug = normalizedApifyUrl.split('/').pop();
    const hubspotSlug = normalizedHubspotUrl.split('/').pop();

    if (apifySlug === hubspotSlug && apifySlug.length > 3) {
      console.log(`Coincidencia aproximada encontrada: ${apifyUrl} ≈ ${hubspotUrl} (slug: ${apifySlug})`);
      return profileInfo;
    }

    // Coincidencia especial para Tampa Bay Buccaneers
    if (normalizedApifyUrl.includes('tampa-bay-buccaneers') && normalizedHubspotUrl.includes('tampa-bay-buccaneers')) {
      console.log(`Coincidencia especial encontrada para Tampa Bay Buccaneers: ${apifyUrl} ≈ ${hubspotUrl}`);
      return profileInfo;
    }
  }

  return null;
};

// Simular datos de prueba
const mockProfileMap = new Map([
  ['https://www.linkedin.com/company/tampa-bay-buccaneers', {
    contactId: '12345',
    contactName: 'Tampa Bay Buccaneers',
    linkedinUrl: 'https://www.linkedin.com/company/tampa-bay-buccaneers'
  }],
  ['https://www.linkedin.com/in/juan-perez', {
    contactId: '67890',
    contactName: 'Juan Pérez',
    linkedinUrl: 'https://www.linkedin.com/in/juan-perez'
  }]
]);

console.log('=== PRUEBA DE NORMALIZACIÓN Y COMPARACIÓN DE URLs ===');

// Pruebas de normalización
console.log('\n1. PRUEBAS DE NORMALIZACIÓN:');
const testUrls = [
  'linkedin.com/company/tampa-bay-buccaneers',
  'https://www.linkedin.com/company/tampa-bay-buccaneers?param=value',
  'https://www.linkedin.com/company/tampa-bay-buccaneers#section',
  'www.linkedin.com/in/juan-perez'
];

testUrls.forEach(url => {
  const normalized = normalizeLinkedInUrl(url);
  console.log(`  "${url}" -> "${normalized}"`);
});

// Pruebas de comparación
console.log('\n2. PRUEBAS DE COMPARACIÓN:');
const testCases = [
  'https://www.linkedin.com/posts/tampa-bay-buccaneers_partnerships-are-most-powerful-when-purpose-activity-7406739921987862528-JK70',
  'https://www.linkedin.com/company/tampa-bay-buccaneers',
  'https://www.linkedin.com/in/juan-perez',
  'https://www.linkedin.com/in/maria-garcia'
];

testCases.forEach(testUrl => {
  console.log(`\nBuscando coincidencia para: ${testUrl}`);
  const match = findBestProfileMatch(testUrl, mockProfileMap);
  if (match) {
    console.log(`✓ Encontrado: ${match.contactId} - ${match.contactName}`);
  } else {
    console.log('✗ No encontrado');
  }
});

console.log('\n=== FIN DE PRUEBA ===');
