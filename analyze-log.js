#!/usr/bin/env node

const fs = require('fs');

function analyzeLog(logPath) {
  if (!fs.existsSync(logPath)) {
    console.log('❌ Archivo no encontrado:', logPath);
    return;
  }

  console.log('📄 Analizando log:', logPath);

  const logContent = fs.readFileSync(logPath, 'utf-8');
  const namePattern = /Post: ([^-]+) - Post LinkedIn/g;

  const names = [];
  let match;
  const seen = new Set();

  while ((match = namePattern.exec(logContent)) !== null) {
    const name = match[1].trim();
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }

  console.log('\n📋 Nombres únicos extraídos del log:', names.length);
  console.log('\n🔝 Primeros 10 nombres:');
  names.slice(0, 10).forEach((name, i) => {
    console.log(`${i + 1}. ${name}`);
  });

  // Contar duplicados
  const countMap = {};
  names.forEach(name => {
    countMap[name] = (countMap[name] || 0) + 1;
  });

  const duplicates = Object.entries(countMap).filter(([name, count]) => count > 1);
  console.log(`\n⚠️  Nombres que aparecen múltiples veces en el log (${duplicates.length}):`);
  duplicates.slice(0, 10).forEach(([name, count]) => {
    console.log(`   • ${name}: ${count} veces`);
  });

  if (duplicates.length > 10) {
    console.log(`   ... y ${duplicates.length - 10} más`);
  }

  // Contar total de posts movidos
  const postPattern = /📤 Moviendo:/g;
  let postCount = 0;
  while (postPattern.exec(logContent) !== null) {
    postCount++;
  }

  console.log(`\n📊 Total de posts movidos: ${postCount}`);
  console.log(`📊 Nombres únicos: ${names.length}`);
  console.log(`📊 Nombres con múltiples posts: ${duplicates.length}`);

  return {
    totalPosts: postCount,
    uniqueNames: names.length,
    duplicates: duplicates.length,
    names: names,
    duplicateList: duplicates
  };
}

const logPath = process.argv[2] || '/Users/diegoguerrero/Downloads/logs.1767670297081.log';
analyzeLog(logPath);
