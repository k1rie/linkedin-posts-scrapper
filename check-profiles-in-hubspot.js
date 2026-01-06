#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');

// Configuración de HubSpot
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

/**
 * Buscar contactos por nombre en HubSpot
 */
async function searchContactsByName(names) {
  console.log('🔍 Buscando contactos en HubSpot...\n');

  const results = [];

  for (const name of names) {
    try {
      console.log(`🔎 Buscando: "${name}"`);

      const searchQuery = {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'firstname',
                operator: 'CONTAINS_TOKEN',
                value: name.split(' ')[0] // Primer nombre
              }
            ]
          }
        ],
        properties: ['firstname', 'lastname', 'linkedin', 'hs_linkedin_url', 'scrapeado_linkedin']
      };

      // Si tiene apellido, buscar también por apellido
      if (name.split(' ').length > 1) {
        searchQuery.filterGroups[0].filters.push({
          propertyName: 'lastname',
          operator: 'CONTAINS_TOKEN',
          value: name.split(' ').slice(1).join(' ') // Apellido
        });
      }

      const response = await axios.post(
        `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/search`,
        searchQuery,
        {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const contacts = response.data.results || [];
      console.log(`   📊 Encontrados: ${contacts.length} contactos`);

      if (contacts.length > 0) {
        contacts.forEach(contact => {
          const linkedinUrl = contact.properties.linkedin ||
                            contact.properties.hs_linkedin_url ||
                            'No tiene LinkedIn';
          const scraped = contact.properties.scrapeado_linkedin || 'No scrapeado';

          console.log(`   👤 ${contact.properties.firstname || ''} ${contact.properties.lastname || ''}`);
          console.log(`      LinkedIn: ${linkedinUrl}`);
          console.log(`      Scrapeado: ${scraped}`);
          console.log(`      ID: ${contact.id}`);
        });
      }

      results.push({
        name: name,
        found: contacts.length > 0,
        contacts: contacts
      });

      // Delay para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`❌ Error buscando "${name}":`, error.response?.data?.message || error.message);
      results.push({
        name: name,
        found: false,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Extraer nombres únicos del log
 */
function extractNamesFromLog(logPath) {
  const fs = require('fs');

  if (!fs.existsSync(logPath)) {
    throw new Error(`Archivo no encontrado: ${logPath}`);
  }

  const logContent = fs.readFileSync(logPath, 'utf-8');
  const namePattern = /Post: ([^-]+) - Post LinkedIn/g;

  const names = [];
  let match;

  while ((match = namePattern.exec(logContent)) !== null) {
    const name = match[1].trim();
    if (!names.includes(name)) {
      names.push(name);
    }
  }

  return names;
}

/**
 * Función principal
 */
async function main() {
  try {
    const logPath = process.argv[2];

    if (!logPath) {
      console.log('Uso: node check-profiles-in-hubspot.js <ruta_al_log>');
      console.log('Ejemplo: node check-profiles-in-hubspot.js /Users/diegoguerrero/Downloads/logs.1767670297081.log');
      return;
    }

    console.log('📄 Analizando log:', logPath);
    const names = extractNamesFromLog(logPath);
    console.log(`\n📋 Nombres extraídos del log: ${names.length}`);
    names.forEach(name => console.log(`   • ${name}`));

    console.log('\n🔍 Verificando existencia en HubSpot...\n');

    const results = await searchContactsByName(names.slice(0, 5)); // Solo primeros 5 para no sobrecargar

    console.log('\n📊 RESUMEN:');
    const found = results.filter(r => r.found).length;
    const notFound = results.filter(r => !r.found).length;

    console.log(`✅ Contactos encontrados en HubSpot: ${found}`);
    console.log(`❌ Contactos NO encontrados: ${notFound}`);

    if (names.length > 5) {
      console.log(`\n💡 Solo se verificaron los primeros 5 nombres. Total en el log: ${names.length}`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  searchContactsByName,
  extractNamesFromLog
};
