
const translations = {
en:{search:"Search",underway:"Underway",port:"At Port",warning:"Warning",critical:"Critical",sanctioned:"Sanctioned"},
fr:{search:"Recherche",underway:"En navigation",port:"Au port",warning:"Alerte",critical:"Critique",sanctioned:"Sanctionné"},
es:{search:"Buscar",underway:"En navegación",port:"En puerto",warning:"Advertencia",critical:"Crítico",sanctioned:"Sancionado"}
};

let currentLang = localStorage.getItem("lang") || "en";

function applyTranslations(){
document.querySelectorAll("[data-i18n]").forEach(el=>{
const key = el.dataset.i18n;
if(translations[currentLang] && translations[currentLang][key]){
el.textContent = translations[currentLang][key];
}
});
document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>{
const key = el.dataset.i18nPlaceholder;
if(translations[currentLang] && translations[currentLang][key]){
el.placeholder = translations[currentLang][key];
}
});
}

function setLanguage(lang){
if(!translations[lang]) return;
currentLang = lang;
localStorage.setItem("lang", lang);
applyTranslations();
}

document.addEventListener("DOMContentLoaded", applyTranslations);
