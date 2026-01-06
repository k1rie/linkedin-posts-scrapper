/**
 * Script para probar la lógica de mapeo de perfiles sin necesidad de HubSpot
 */

// Simular datos de HubSpot
const mockHubspotProfiles = [
  {
    contactId: '12345',
    contactName: 'Juan Pérez',
    linkedinUrl: 'https://www.linkedin.com/in/juan-perez'
  },
  {
    contactId: '67890',
    contactName: 'María García',
    linkedinUrl: 'https://www.linkedin.com/in/maria-garcia'
  },
  {
    contactId: '11111',
    contactName: 'Pedro López',
    linkedinUrl: 'https://www.linkedin.com/in/pedro-lopez'
  }
];

// Simular resultados de Apify
const mockApifyResults = {
  profiles: [
    {
      profileUrl: 'https://www.linkedin.com/in/juan-perez',
      posts: [
        { url: 'https://www.linkedin.com/posts/juan-perez_post1' },
        { url: 'https://www.linkedin.com/posts/juan-perez_post2' }
      ]
    },
    {
      profileUrl: 'https://www.linkedin.com/in/maria-garcia',
      posts: [
        { url: 'https://www.linkedin.com/posts/maria-garcia_post1' }
      ]
    },
    {
      profileUrl: 'https://www.linkedin.com/in/pedro-lopez',
      posts: [
        { url: 'https://www.linkedin.com/posts/pedro-lopez_post1' },
        { url: 'https://www.linkedin.com/posts/pedro-lopez_post2' },
        { url: 'https://www.linkedin.com/posts/pedro-lopez_post3' }
      ]
    }
  ]
};

console.log('=== PRUEBA DE MAPEO DE PERFILES ===');
console.log('Perfiles de HubSpot:', mockHubspotProfiles.length);
console.log('Resultados de Apify:', mockApifyResults.profiles.length);

// Crear el profileMap (esta es la lógica que agregamos)
const profileMap = new Map(mockHubspotProfiles.map(p => [p.linkedinUrl, p]));

console.log('\n=== PROCESANDO PERFILES ===');

let markedContacts = 0;

for (const profileResult of mockApifyResults.profiles) {
  // Esta es la lógica que agregamos en extractPosts
  const profileInfo = profileMap.get(profileResult.profileUrl);

  console.log(`\nProcesando: ${profileResult.profileUrl}`);
  console.log(`Posts encontrados: ${profileResult.posts.length}`);

  if (profileInfo) {
    console.log(`✓ Encontrado contactId: ${profileInfo.contactId} (${profileInfo.contactName})`);
    // Aquí se marcaría como scrapeado
    console.log(`  → MARCANDO CONTACTO ${profileInfo.contactId} COMO SCRAPEADO`);
    markedContacts++;
  } else {
    console.log(`✗ NO se encontró contactId para este perfil`);
  }
}

console.log(`\n=== RESULTADO ===`);
console.log(`Contactos que se marcarían como scrapeados: ${markedContacts}/${mockApifyResults.profiles.length}`);

if (markedContacts === mockApifyResults.profiles.length) {
  console.log('✅ ÉXITO: Todos los perfiles fueron mapeados correctamente!');
} else {
  console.log('❌ ERROR: Algunos perfiles no se pudieron mapear');
}

console.log('\n=== FIN DE PRUEBA ===');
