import React, { Component } from 'react';

import leaflet from 'leaflet'
import { Map, TileLayer, GeoJSON } from 'react-leaflet';

import './Mapa.css';

class Mapa extends Component {

  render() {
    const { geom, hideZoom, disableInteractions, title, title2, placeholder } = this.props;
    const bounds = leaflet.geoJSON(geom).getBounds();

	if (!geom || geom.length === 0) {
		return (
			<div className="map-title" style={{	height: '100%',	width: '100%' }}>
				{title && <button className="btn btn-light disabled">{title}</button>}
         		{title2 && <button variant="info" className="btn btn-light map-title-left">{title2}</button>}
				<img src={placeholder} />		
			</div>
		)	
	}

    return (
      
	  <Map
        center={bounds.getCenter()}
        bounds={bounds}
        zoomControl={!hideZoom}
        boxZoom={!disableInteractions}
        maxZoom={17}
        doubleClickZoom={!disableInteractions}
        dragging={!disableInteractions}
        keyboard={!disableInteractions}
        scrollWheelZoom={!disableInteractions}
        tap={!disableInteractions}
        touchZoom={!disableInteractions}
        style={{
          height: '100%',
          width: '100%',
        }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
        />
        <GeoJSON data={geom} />
        <div className="map-title">
          {title && <button className="btn btn-light disabled">{title}</button>}
          {title2 && <button variant="info" className="btn btn-light map-title-left">{title2}</button>}
        </div>
      </Map>
    );
  }
}

export default Mapa;
