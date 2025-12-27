require('dotenv').config();
const hubspotService = require('../services/hubspotService');
const apifyService = require('../services/apifyService');
const loggerService = require('../services/loggerService');

/**
 * Script de prueba para ver la estructura real de los datos
 * Procesa solo 2 contactos para debugging
 */
const testStructure = async () => {
  try {
    loggerService.info('=== TEST DE ESTRUCTURA DE DATOS ===\n');

    // 1. Obtener perfiles de HubSpot (solo 2 para prueba)
    loggerService.info('1. Obteniendo perfiles de HubSpot...');
    const hubspotProfiles = await hubspotService.getLinkedInProfilesFromHubSpot();
    
    if (hubspotProfiles.length === 0) {
      loggerService.error('No se encontraron perfiles en HubSpot');
      return;
    }

    // Limitar a solo 2 perfiles para prueba
    const testProfiles = hubspotProfiles.slice(0, 2);
    loggerService.info(`\n📋 Perfiles a procesar (limitado a 2): ${testProfiles.length}`);
    
    // Mostrar estructura de HubSpot
    loggerService.info('\n=== ESTRUCTURA DE HUBSPOT ===');
    testProfiles.forEach((profile, index) => {
      loggerService.info(`\nPerfil ${index + 1}:`);
      loggerService.info(`  Tipo: ${typeof profile}`);
      loggerService.info(`  Estructura completa:`, JSON.stringify(profile, null, 2));
      loggerService.info(`  contactId: ${profile.contactId} (tipo: ${typeof profile.contactId})`);
      loggerService.info(`  contactName: ${profile.contactName} (tipo: ${typeof profile.contactName})`);
      loggerService.info(`  linkedinUrl: ${profile.linkedinUrl} (tipo: ${typeof profile.linkedinUrl})`);
    });

    // 2. Llamar a Apify con los perfiles
    const profileUrls = testProfiles.map(p => p.linkedinUrl);
    loggerService.info(`\n=== LLAMANDO A APIFY CON ${profileUrls.length} PERFIL(ES) ===`);
    loggerService.info(`URLs: ${profileUrls.join(', ')}`);
    
    const apifyResults = await apifyService.extractPostsFromProfiles(profileUrls);
    
    // Mostrar estructura de Apify
    loggerService.info('\n=== ESTRUCTURA DE APIFY ===');
    loggerService.info(`Total items: ${apifyResults.totalItems}`);
    loggerService.info(`Perfiles encontrados: ${apifyResults.profiles.length}`);
    
    apifyResults.profiles.forEach((profileResult, index) => {
      loggerService.info(`\n--- Perfil ${index + 1} de Apify ---`);
      loggerService.info(`  Tipo: ${typeof profileResult}`);
      loggerService.info(`  Estructura completa:`, JSON.stringify(profileResult, null, 2));
      loggerService.info(`  profileUrl: ${profileResult.profileUrl} (tipo: ${typeof profileResult.profileUrl})`);
      loggerService.info(`  profileName: ${profileResult.profileName} (tipo: ${typeof profileResult.profileName})`);
      loggerService.info(`  Posts: ${profileResult.posts.length}`);
      
      if (profileResult.posts.length > 0) {
        loggerService.info(`  Primer post:`, JSON.stringify(profileResult.posts[0], null, 2));
      }
    });

    // 3. Probar guardado en HubSpot (solo el primer post del primer perfil)
    if (apifyResults.profiles.length > 0 && apifyResults.profiles[0].posts.length > 0) {
      const firstProfile = apifyResults.profiles[0];
      const firstPost = firstProfile.posts[0];
      
      // Buscar el perfil en HubSpot para obtener el nombre
      const hubspotProfile = testProfiles.find(p => p.linkedinUrl === firstProfile.profileUrl);
      
      loggerService.info('\n=== PRUEBA DE GUARDADO EN HUBSPOT ===');
      loggerService.info(`Perfil de HubSpot encontrado:`, JSON.stringify(hubspotProfile, null, 2));
      loggerService.info(`Nombre a usar: ${hubspotProfile?.contactName || firstProfile.profileName || 'N/A'}`);
      loggerService.info(`Tipo del nombre: ${typeof (hubspotProfile?.contactName || firstProfile.profileName)}`);
      
      // Preparar el nombre correctamente
      let profileName = null;
      if (hubspotProfile?.contactName) {
        profileName = typeof hubspotProfile.contactName === 'string' 
          ? hubspotProfile.contactName 
          : String(hubspotProfile.contactName);
      } else if (firstProfile.profileName) {
        profileName = typeof firstProfile.profileName === 'string'
          ? firstProfile.profileName
          : String(firstProfile.profileName);
      }
      
      loggerService.info(`Nombre final preparado: "${profileName}" (tipo: ${typeof profileName})`);
      loggerService.info(`URL del perfil: ${firstProfile.profileUrl}`);
      loggerService.info(`URL del post: ${firstPost.url}`);
      
      // Intentar guardar en HubSpot
      loggerService.info('\n→ Guardando en HubSpot...');
      const hubspotResult = await hubspotService.createDealForPost(
        firstPost,
        firstProfile.profileUrl,
        profileName
      );
      
      if (hubspotResult) {
        loggerService.success(`✓ Deal creado en HubSpot: ${hubspotResult.id}`);
        loggerService.info(`Resultado:`, JSON.stringify(hubspotResult, null, 2));
      } else {
        loggerService.warn('No se pudo crear el deal en HubSpot');
      }
    }

    loggerService.info('\n=== TEST COMPLETADO ===');
    
  } catch (error) {
    loggerService.error('Error en test:', error);
    console.error('Stack trace:', error.stack);
  }
};

// Ejecutar test
testStructure().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Error fatal:', error);
  process.exit(1);
});

