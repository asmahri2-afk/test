

// map
const map = L.map('map').setView([28.0,-11.0],5);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
maxZoom:19
}).addTo(map);

// demo vessels (replace with your data feed)
const vessels=[
{imo:"111",name:"Alpha",lat:28.2,lon:-11.2,status:"underway"},
{imo:"222",name:"Bravo",lat:27.9,lon:-11.0,status:"port"},
{imo:"333",name:"Charlie",lat:28.1,lon:-10.8,status:"warning"},
{imo:"444",name:"Delta",lat:28.3,lon:-11.5,status:"critical"},
{imo:"555",name:"Echo",lat:27.8,lon:-10.7,status:"sanction"}
];

const markers=new Map();

const statusColors={
underway:"green",
port:"blue",
warning:"orange",
critical:"red",
sanction:"darkred"
};

function createMarker(v){

const marker=L.circleMarker([v.lat,v.lon],{
radius:7,
color:statusColors[v.status],
fillOpacity:0.9
}).addTo(map);

marker.bindPopup(v.name+" ("+v.imo+")");

markers.set(v.imo,{marker:marker,status:v.status});

}

vessels.forEach(createMarker);

// legend filtering
let activeFilters={
underway:true,
port:true,
warning:true,
critical:true,
sanction:true
};

document.querySelectorAll(".legend-item").forEach(el=>{

el.addEventListener("click",()=>{

const type=el.dataset.filter;

activeFilters[type]=!activeFilters[type];

el.classList.toggle("legend-disabled");

applyFilters();

});

});

function applyFilters(){

markers.forEach((obj)=>{

if(activeFilters[obj.status]){

map.addLayer(obj.marker);

}else{

map.removeLayer(obj.marker);

}

});

}

// search
const search=document.getElementById("searchInput");

search.addEventListener("input",()=>{

const q=search.value.toLowerCase().trim();

markers.forEach((obj,imo)=>{

const vessel=vessels.find(v=>v.imo===imo);

if(!q || vessel.name.toLowerCase().includes(q) || imo.includes(q)){

map.addLayer(obj.marker);

}else{

map.removeLayer(obj.marker);

}

});

});

