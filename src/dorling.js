import * as d3 from "d3";
import * as d3Array from "d3-array";

import * as d3Geo from "d3-geo";

import * as topojson from "topojson";
import { legendColor } from "d3-svg-legend";
import "./styles.css";
import { interpolateBlues } from "d3";

export function dorling(options) {
  //the output object
  let out = {};

  //default values
  out.containerId_ = "";
  //styles
  out.seaColor_ = "white";
  out.playButtonFill_ = "#777777";
  out.coastalMargins_ = false;
  out.graticule_ = true;
  out.highlightColor_ = "cyan";
  out.nutsBorderColor_ = "grey";
  //d3 force
  out.circleExaggerationFactor_ = 1.2;
  out.collisionPadding_ = 0.1;
  out.positionStrength_ = 0.2;
  out.collisionStrength_ = 0.6;
  out.simulationDuration_ = 8000; //duration of d3 force simulation in miliseconds

  //d3-geo
  out.scale_ = null;
  out.rotateX_ = -13;
  out.rotateY_ = -61;
  out.translateX_ = null; //340;
  out.translateY_ = null; //216;
  out.fitSizePadding_ = 0;
  //viewbox
  out.width_ = 1000;
  out.height_ = 1000;
  //d3 scale
  out.colorScheme_ = "interpolateRdYlBu";
  out.colors_ = null; //["#000",etc]
  out.thresholdValues_ = null; //[1,100,1000]
  out.thresholds_ = 7;
  //interactivity
  out.zoom_ = true;
  out.animate_ = true;
  out.loop_ = true;
  out.pauseButton_ = false;
  out.showBorders_ = false;

  //size legend


  //size legend (circle radiuses)
  out.sizeLegend_ = {
    title: "Total population",
    titleYOffset: 0,
    titleXOffset: 23,
    textFunction: function (d) { return d },
    values: null,
    translateY: 215
  };

  //color legend
  out.colorLegend_ = {
    //https://d3-legend.susielu.com/#color
    titleWidth: 170,
    title: "Population change (‰)",
    orient: "vertical",
    cells: null,
    shape: "rect",
    shapeRadius: 10,
    shapePadding: 5,
    labelAlign: "middle",
    labelOffset: 10,
    labelFormat: d3.format(".1f"),
    locale: {
      "decimal": "\u066b",
      "thousands": " ",
      "grouping": [3],
      "currency": ["", " \u062f\u002e\u0625\u002e"],
      "numerals": ["\u0660", "\u0661", "\u0662", "\u0663", "\u0664", "\u0665", "\u0666", "\u0667", "\u0668", "\u0669"]
    },
    labelFontSize: 15,
    labelDelimiter: " to ",
    labelUnit: " ",
    labelWrap: 140,
    labelDecNb: 2,
    x: 0,
    y: 0
  };


  //tooltip html
  out.tooltip_ = {
    colorLabel: "Color value:",
    colorUnit: "",
    sizeLabel: "Size value:",
    sizeUnit: "",
    shareLabel: "Share value:"
  }

  //data params
  out.nutsLevel_ = 2;
  out.showNutsSelector_ = true;
  out.sizeDatasetCode_ = "demo_r_pjangrp3";
  out.sizeDatasetFilters_ = "sex=T&age=TOTAL&unit=NR&time=2018";
  out.colorDatasetCode_ = "demo_r_gind3";
  out.colorDatasetFilters_ = "indic_de=GROWRT&time=2018";
  out.exclude_ = null; //list of country codes to exclude from the data

  //animation loop
  out.playing = true;

  //definition of generic accessors based on the name of each parameter name
  for (let p in out)
    (function () {
      let p_ = p;
      out[p_.substring(0, p_.length - 1)] = function (v) {
        if (!arguments.length) return out[p_];
        out[p_] = v;
        return out;
      };
    })();

  //override some accesors
  out.colorLegend = function (v) {
    for (let key in v) {
      out.colorLegend_[key] = v[key];
    }
    return out;
  };

  out.sizeLegend = function (v) {
    for (let key in v) {
      out.sizeLegend_[key] = v[key];
    }
    return out;
  };

  out.tooltip = function (v) {
    for (let key in v) {
      out.tooltip_[key] = v[key];
    }
    return out;
  };

  //main build function
  out.build = function () {

    out.container_ = d3.select("#" + out.containerId_);
    addLoadingSpinnerToDOM();
    showLoadingSpinner();

    //get data and animate
    out.main();
    return out;
  };


  //e.g. when changing nuts level
  out.rebuild = function () {
    restartTransition();
    out.playing = false;
    out.stage = 1;

    out.container_ = d3.select("#" + out.containerId_);
    clearSvg();
    showLoadingSpinner();
    out.main();
    return out;
  }
  function clearSvg() {
    //empty svg
    out.container_.selectAll("g").remove();
    out.container_.selectAll("svg").remove();
  }


  out.main = function () {
    let nutsParam;
    if (out.nutsLevel_ == 0) {
      nutsParam = "country"
    } else {
      nutsParam = "nuts" + out.nutsLevel_
    }
    //data promises
    let promises = [];
    promises.push(
      d3.json(
        `https://raw.githubusercontent.com/eurostat/Nuts2json/master/2016/3035/nutspt_${out.nutsLevel_}.json`
      ), //centroids
      d3.json(
        `https://raw.githubusercontent.com/eurostat/Nuts2json/master/2016/3035/20M/${out.nutsLevel_}.json`
      ), //NUTS
      d3.json(
        `https://raw.githubusercontent.com/eurostat/Nuts2json/master/2016/3035/20M/0.json`
      ), //countries
      d3.json(
        `https://ec.europa.eu/eurostat/wdds/rest/data/v2.1/json/en/${out.sizeDatasetCode_}?geoLevel=${nutsParam}&${out.sizeDatasetFilters_}`
      ), //sizeData
      d3.json(
        `https://ec.europa.eu/eurostat/wdds/rest/data/v2.1/json/en/${out.colorDatasetCode_}?geoLevel=${nutsParam}&${out.colorDatasetFilters_}`
      ), //colorData
    );

    Promise.all(promises).then((res) => {
      hideLoadingSpinner();
      //stop previous simulation
      if (out.simulation) {
        out.simulation.stop()
        out.forceInProgress = false;
      }

      out.centroids = res[0];
      //remove excluded country codes from centroids feature array
      if (out.exclude_) {
        let newFeatures = [];
        out.centroids.features.forEach((f) => {
          if (out.exclude_.indexOf(f.properties.id.substring(0, 2)) == -1) {
            newFeatures.push(f);
          }
        });
        out.centroids.features = newFeatures;
      }

      out.n2j = res[1];
      out.nuts0 = res[2];

      let sizeData = res[3];
      let colorData = res[4];

      // let nuts = topojson.feature(n2, n2.objects.nutsbn).features;
      // let country = topojson.feature(countries, countries.objects.nutsbn).features;
      // let coastlines = topojson.feature(n2, n2.objects.nutsbn).features;

      out.sizeIndicator = indexStat(sizeData);
      out.colorIndicator = indexStat(colorData);
      out.totalsIndex = getTotals(out.sizeIndicator); //total of sizeIndicator for each country

      // exclude values from eurostat data indices
      if (out.exclude_) {
        let newSizeIndicator = {};
        for (let key in out.sizeIndicator) {
          if (out.exclude_.indexOf(key.substring(0, 2)) == -1 && key !== "EU28" && key !== "EU27_2020") {
            newSizeIndicator[key] = out.sizeIndicator[key];
          }
        }
        out.sizeIndicator = newSizeIndicator;
      }

      out.countryNamesIndex_ = getCountryNamesIndex();

      out.height_ = out.width_ * (out.n2j.bbox[3] - out.n2j.bbox[1]) / (out.n2j.bbox[2] - out.n2j.bbox[0])

      //set up svg element
      out.svg = d3.create("svg");
      out.svg
        .attr("viewBox", [0, 0, out.width_, out.height_])
        .attr("id", "dorling-svg")
        .style("background-color", out.seaColor_)
      out.container_.node().appendChild(out.svg.node());
      out.container_.attr("class", "dorling-container");
      // initialize tooltip
      if (!out.tooltipElement) {
        out.tooltipElement = addTooltipToDOM();
      }

      // d3-geo
      out.projection = d3Geo
        .geoIdentity()
        .reflectY(true)
        .fitExtent([[0, 0], [out.width_ + out.fitSizePadding_, out.height_ + out.fitSizePadding_]], topojson.feature(out.n2j, out.n2j.objects.nutsbn))
      //out.path = d3.geoPath().projection(out.projection);
      out.path = d3Geo.geoPath().projection(out.projection);

      if (out.translateX_ && out.translateY_) {
        out.projection.translate([out.translateX_, out.translateY_]);
      }
      if (out.scale_) {
        out.projection.scale(out.scale_);
      }

      //d3 scale
      out.colorExtent = d3.extent(Object.values(out.colorIndicator));
      out.sizeExtent = d3.extent(Object.values(out.sizeIndicator));
      //color scale
      out.colorScale = defineColorScale();

      if (out.graticule_) {
        out.graticule = out.svg.append("g").selectAll("path").data(topojson.feature(out.n2j, out.n2j.objects.gra).features)
          .enter().append("path").attr("d", out.path).attr("class", "dorling-graticule");
      }

      //coastal margin
      if (out.coastalMargins_) {
        //define filter for coastal margin
        // out.svg.append("filter").attr("id", "coastal_blur").attr("x", "-200%").attr("y", "-200%").attr("width", "400%").attr("height", "400%")
        //   .append("feGaussianBlur").attr("in", "SourceGraphic").attr("stdDeviation", "14")
        //   ;		//draw coastal margin

        // //draw coastal margin
        // var cg = out.svg.append("g").attr("id", "g_coast_margin")
        //   .style("fill", "none")
        //   .style("stroke-width", "13")
        //   .style("stroke", "white")
        //   .style("filter", "url(#coastal_blur)")
        //   .style("stroke-linejoin", "round")
        //   .style("stroke-linecap", "round");

        // //country coastal margins
        // out.svg.append("g").selectAll("path").data(topojson.feature(out.n2j, out.n2j.objects.cntbn).features).enter()
        //   .append("path").attr("d", out.path)
        //   .style("fill", "none").style("stroke-width", "10").style("filter", "url(#coastal_blur)").style("stroke-linejoin", "round").style("stroke-linecap", "round")
        //   .style("stroke", function (bn) { if (bn.properties.co === "T") return "white"; return "none"; })
        //   ;
        // //nuts coastal margins
        // out.svg.append("g").selectAll("path").data(topojson.feature(out.n2j, out.n2j.objects.nutsbn).features).enter()
        //   .append("path").attr("d", out.path)
        //   .style("fill", "none").style("stroke-width", "10").style("filter", "url(#coastal_blur)").style("stroke-linejoin", "round").style("stroke-linecap", "round")
        //   .style("stroke", function (bn) { if (bn.properties.co === "T") return "white"; return "none"; })
        //   ;

        //multiple margins
        // out.marginNb = 3;
        // out.margins = []
        // for (let m = out.marginNb; m >= 1; m--) {
        //   out.margins.push(out.svg
        //     .append("g")
        //     .selectAll("path")
        //     .data(topojson.feature(out.n2j, out.n2j.objects.nutsbn).features)
        //     .enter()
        //     .append("path")
        //     .attr("d", out.path)
        //     //.attr("class", "dorling-cmarg")
        //     .attr("fill", "none")
        //     .attr("stroke-linecap", "round")
        //     .attr("stroke-linejoin", "round")
        //     .attr("stroke-width", m * 10 + "px")
        //     .attr("stroke", d3.interpolateBlues(1 - Math.sqrt(m / out.marginNb)))
        //   );
        // }
      }

      if (out.showBorders_) {
        //draw regions
        out.countries = out.svg.append("g").attr("id", "dorling-countries").selectAll("path").data(topojson.feature(out.n2j, out.n2j.objects.cntrg).features)
          .enter().append("path").filter((f) => {
            //exclude GL
            if (f.properties.id !== "GL") {
              return f;
            }
          }).attr("d", out.path).attr("class", "cntrg");

        out.nuts = out.svg.append("g").attr("id", "dorling-nuts").selectAll("path").data(topojson.feature(out.n2j, out.n2j.objects.nutsrg).features)
          .enter().append("path").attr("d", out.path).attr("class", function (bn) {
            if (out.exclude_.indexOf(bn.properties.id.substring(0, 2)) == -1) {
              return "nutsrg"
            } else {
              return "cntrg"
            }
          });

        //draw boundaries
        //countries
        out.countryBorders = out.svg.append("g").selectAll("path").data(topojson.feature(out.n2j, out.n2j.objects.cntbn).features)
          .enter().append("path").filter((f) => {
            //exclude GL
            if (f.properties.id !== "GL") {
              return f;
            }
          }).attr("d", out.path)
          .attr("class", function (bn) { return "cntbn" + (bn.properties.co === "T" ? " coastal" : ""); });
      }
      //nuts
      out.nutsBorders = out.svg.append("g").attr("id", "dorling-nuts-borders").selectAll("path").data(topojson.feature(out.n2j, out.n2j.objects.nutsbn).features)
        .enter().append("path").filter((f) => {
          // if (f.properties.eu == "T" || f.properties.efta == "T") {
          return f;
          // }
        }).attr("d", out.path)
        .attr("stroke", out.nutsBorderColor_).attr("fill", "none").attr("class", function (f) {
          let c = "";
          if (f.properties.co === "T") {
            c = c + "coastal"
          }
          if (f.properties.eu !== "T" && f.properties.efta !== "T") {
            c = c + "dorling-no-data";
          }
          return c
          // }
        });

      // out.kosovo = out.svg.append("g").selectAll("path").data(topojson.feature(out.n2j, out.n2j.objects.cntbn).features)
      //   .enter().append("path").filter(function (f) {
      //     return f.properties.id == 999999
      //   }).attr("d", out.path)
      //   .attr("stroke", "lightgrey").attr("fill", "none")


      //define region centroids
      out.circles = out.svg
        .append("g")
        .selectAll("circle")
        .data(out.centroids.features)
        .enter()
        .append("circle")
        .attr("cx", (f) => out.projection(f.geometry.coordinates)[0])
        .attr("cy", (f) => out.projection(f.geometry.coordinates)[1])
        .attr("r", (f) => 0.000055 * Math.sqrt(f.properties.ar))
        .attr("fill", "#ffffff00")
        .attr("stroke", "#40404000");

      addZoom();
      addLegendsToDOM();
      addMouseEvents();
      if (out.showNutsSelector_ && !out.nutsSelector) {
        //out.nutsSelector = true;
        addNutsSelectorToDOM();
      }

      if (out.animate_) {
        if (out.pauseButton_) {
          out.playButton = addPlayButtonToDOM();
        }
        out.playing = true;
        out.stage = 1; //current transition number
        animate();
      } else {
        showDorlingWithoutAnimation();
      }
    });
    return out;
  };

  function addMouseEvents() {
    out.circles.on("mouseover", function (f) {
      if (out.stage == 2) {
        d3.select(this).attr("fill", out.highlightColor_);
        out.tooltipElement.html(`<strong>${f.properties.na}</strong>
                    (${f.properties.id}) <i>${out.countryNamesIndex_[f.properties.id[0] + f.properties.id[1]]}</i><br>
                    ${out.tooltip_.sizeLabel}: ${formatNumber(out.sizeIndicator[f.properties.id])} ${out.tooltip_.sizeUnit}<br>
                    ${out.tooltip_.shareLabel}: ${(
            (out.sizeIndicator[f.properties.id] /
              out.totalsIndex[f.properties.id.substring(0, 2)]) *
            100
          ).toFixed(0)} % <br>
        ${out.tooltip_.colorLabel}: <strong>${
          formatNumber(parseInt(out.colorIndicator[f.properties.id]))
          } ${out.tooltip_.colorUnit}</strong><br>
                `);
        let matrix = this.getScreenCTM().translate(
          +this.getAttribute("cx"),
          +this.getAttribute("cy")
        );
        out.tooltipElement.style("visibility", "visible");
        //position + offsets
        let node = out.tooltipElement.node();
        let tooltipWidth = node.offsetWidth;
        let tooltipHeight = node.offsetHeight;
        let left = window.pageXOffset + matrix.e + 20;
        let top = window.pageYOffset + matrix.f - 100;
        if (left > out.width_ - tooltipWidth) {
          left = left - (tooltipWidth + 40);
        }
        if (top < 0) {
          top = top + (tooltipHeight + 40);
        }
        out.tooltipElement.style("left", left + "px").style("top", top + "px");
      }
    });
    out.circles.on("mouseout", function () {
      if (out.stage == 2) {
        out.tooltipElement.style("visibility", "hidden");
        d3.select(this).attr("fill", (f) =>
          colorFunction(+out.colorIndicator[f.properties.id])
        );
      }
    });
  }


  function animate() {
    if (out.stage == 1) {
      if (out.playing) {
        setTimeout(function () {
          //out.stage = 1;
          if (out.playing) {
            firstTransition();
            out.stage = 2;
          }
        }, 2000);
      }
    } else if (out.stage == 2) {
      if (out.playing) {
        out.stage = 1;
        restartTransition();
      }
    }
  }

  //hide nuts show circles
  function firstTransition() {
    //show circles
    out.circles
      .transition()
      .duration(1000)
      .attr("r", (f) => toRadius(+out.sizeIndicator[f.properties.id]))
      .attr("fill", (f) => colorFunction(+out.colorIndicator[f.properties.id]))
      .attr("stroke", "black");
    //hide nuts
    if (out.showBorders_) {
      out.nutsBorders.transition().duration(1000).attr("stroke", "grey");
      //out.kosovo.transition().duration(1000).attr("stroke", "#eaeaea");
    } else {
      out.nutsBorders.transition().duration(1000).attr("stroke", "#1f1f1f00");
      //out.nuts.transition().duration(1000).attr("stroke", "#1f1f1f00").attr("fill", "none");
      //out.countries.transition().duration(1000).attr("stroke", "#1f1f1f00").attr("fill", "none");
      if (out.coastalMargins_) {
        if (out.margins) {
          out.margins.forEach((margin => {
            margin.attr("stroke", "#1f1f1f00").attr("stroke-width", "0px");
          }))
        }
      }

    }

    // show legends
    out.legendContainer.transition().duration(1000).attr("opacity", 0.9);
    out.sizeLegendContainer.transition().duration(1000).attr("opacity", 0.9);
    out.radioContainer.transition().duration(1000).attr("opacity", 0.9);


    if (!out.forceInProgress) {
      applyForce();
    }

  }

  function formatNumber(n) {
    return n
      .toLocaleString("en")
      .replace(/,/gi, " ")
  }

  function applyForce() {
    if (out.simulation) {
      out.simulation.stop()
      out.forceInProgress = false;
    }
    out.simulation = d3
      .forceSimulation(out.centroids.features)
      .force(
        "x",
        d3
          .forceX()
          .x((f) => out.projection(f.geometry.coordinates)[0])
        //.strength(out.positionStrength_)
      )
      .force(
        "y",
        d3
          .forceY()
          .y((f) => out.projection(f.geometry.coordinates)[1])
        //.strength(out.positionStrength_)
      )
      .force(
        "collide",
        d3
          .forceCollide()
          .radius((f) => toRadius(+out.sizeIndicator[f.properties.id]))
        //.strength(out.collisionStrength_)
      );

    //set initial position of the circles
    for (const f of out.centroids.features) {
      f.x = out.projection(f.geometry.coordinates)[0];
      f.y = out.projection(f.geometry.coordinates)[1];
    }

    out.simulation.on("tick", () => {
      out.circles.attr("cx", (f) => f.x).attr("cy", (f) => f.y);
    });

    out.forceInProgress = true;

    out.simulation.on("end", function () {
      out.forceInProgress = false;
      // if (!out.loop_) {
      //   out.simulation.stop();
      //   restartTransition();
      // }
      out.simulation.stop();
      if (out.playing) {
        restartTransition();
      }
      //restart after 8 seconds
    });

    // setTimeout(function () {
    //   out.simulation.stop();
    //   if (out.playing) {
    //     restartTransition();
    //   }
    // }, out.simulationDuration_)
    //invalidation.then(() => simulation.stop());
  }


  function restartTransition() {
    out.stage = 1;
    out.tooltipElement.style("visibility", "hidden");
    //reset styles and restart animation
    //fade circles
    out.circles
      .transition()
      .duration(500)
      .attr("fill", "#40404000")
      .attr("stroke", "#40404000");
    // fade-in countries
    if (out.nuts) {
      out.nuts
        .transition()
        .duration(500)
        //.attr("stroke", "#404040ff")
        .attr("fill", "white");
    }

    //out.countries.transition().duration(1000).attr("stroke", "#404040ff").attr("fill", "white");
    if (!out.showBorders_) {
      //hide coastal margins
      if (out.coastalMargins_) {
        if (out.margins) {
          out.margins.forEach((margin, m) => {
            margin
              .attr("stroke", "#404040ff")
              .attr("stroke-width", m * 10 + "px")
              .attr("stroke", d3.interpolateBlues(1 - Math.sqrt(m / out.marginNb)))
              .attr("fill", "none")
              .attr("opacity", "0.6")
              .attr("stroke-linecap", "round")
              .attr("stroke-linejoin", "round");
          })
        }
      }
    } else {
      out.nutsBorders.transition().duration(1000).attr("stroke", out.nutsBorderColor_);
      //out.kosovo.transition().duration(1000).attr("stroke", "#D3D3D3");
    }


    //reset circle locations & color
    // out.circles
    //   .attr("cx", (f) => out.projection(f.geometry.coordinates)[0])
    //   .attr("cy", (f) => out.projection(f.geometry.coordinates)[1])
    //   .attr("r", (f) => 0.000055 * Math.sqrt(f.properties.ar));

    animate();
  }


  function showDorlingWithoutAnimation() {
    //hide nuts
    out.nuts.attr("stroke", "#40404000");
    //show circles
    out.circles
      .attr("r", (f) => toRadius(+out.sizeIndicator[f.properties.id]))
      .attr("fill", (f) => colorFunction(+out.colorIndicator[f.properties.id]))
      .attr("stroke", "black");
    //tooltip
    out.circles.on("mouseover", function (f) {
      d3.select(this).attr("fill", out.highlightColor_);
      out.tooltipElement.html(`<strong>${f.properties.na}</strong>
                  (${f.properties.id}) <i>${out.countryNamesIndex_[f.properties.id[0] + f.properties.id[1]]}</i><br>
                  ${out.tooltip_.sizeLabel}: ${formatNumber(out.sizeIndicator[f.properties.id])}
           ${out.tooltip_.sizeUnit}<br>
                    Share of national population: ${(
          (out.sizeIndicator[f.properties.id] /
            out.totalsIndex[f.properties.id.substring(0, 2)]) *
          100
        ).toFixed(0)} % <br>
      ${out.tooltip_.colorLabel}: <strong>${
        out.colorIndicator[f.properties.id]
        } ${out.tooltip_.colorUnit}</strong><br>
              `);
      let matrix = this.getScreenCTM().translate(
        +this.getAttribute("cx"),
        +this.getAttribute("cy")
      );
      out.tooltipElement.style("visibility", "visible");
      //position + offsets
      let node = out.tooltipElement.node();
      let tooltipWidth = node.offsetWidth;
      let tooltipHeight = node.offsetHeight;
      let left = window.pageXOffset + matrix.e + 20;
      let top = window.pageYOffset + matrix.f - 100;
      if (left > out.width_ - tooltipWidth) {
        left = left - (tooltipWidth + 40);
      }
      if (top < 0) {
        top = top + (tooltipHeight + 40);
      }
      out.tooltipElement.style("left", left + "px").style("top", top + "px");
      // tooltip
      //   .style("top", d3.event.pageY - 110 + "px")
      //   .style("left", d3.event.pageX - 120 + "px");
    });
    out.circles.on("mouseout", function () {
      out.tooltipElement.style("visibility", "hidden");
      d3.select(this).attr("fill", (f) =>
        colorFunction(+out.colorIndicator[f.properties.id])
      );
    });

    //show legends
    out.legendContainer.transition().duration(1000).attr("opacity", 0.9);
    out.sizeLegendContainer.transition().duration(1000).attr("opacity", 0.9);
    out.radioContainer.transition().duration(1000).attr("opacity", 0.9);
    //dorling deformation
    out.simulation = d3
      .forceSimulation(out.centroids.features)
      .force(
        "x",
        d3
          .forceX()
          .x((f) => out.projection(f.geometry.coordinates)[0])
          .strength(out.positionStrength_)
      )
      .force(
        "y",
        d3
          .forceY()
          .y((f) => out.projection(f.geometry.coordinates)[1])
          .strength(out.positionStrength_)
      )
      .force(
        "collide",
        d3
          .forceCollide()
          .radius((f) => toRadius(+out.sizeIndicator[f.properties.id]))
          .strength(out.collisionStrength_)
      );

    //set initial position of the circles
    for (const f of out.centroids.features) {
      f.x = out.projection(f.geometry.coordinates)[0];
      f.y = out.projection(f.geometry.coordinates)[1];
    }

    out.simulation.on("tick", () => {
      out.circles.attr("cx", (f) => f.x).attr("cy", (f) => f.y);
    });

    out.simulation.on("end", function () {
      out.simulation.stop();
    });
  }
  function addZoom() {
    //add d3 zoom
    if (out.zoom_) {
      out.svg.call(
        d3
          .zoom()
          .extent([
            [0, 0],
            [out.width_, out.height_],
          ])
          .translateExtent([
            [0, 0],
            [out.width_, out.height_],
          ])
          .scaleExtent([1, 8])
          .on("zoom", () => {
            zoomed(out.circles, out.coastL);
          })
      );
    }
  }
  function addLegendsToDOM() {
    addColorLegend();
    addSizeLegend();


    //adjust legend bacgkround box height dynamically
    // out.legendBRect = out.legendContainerNode.getBoundingClientRect();
    // out.legendContainerBackground.style("height", out.legendBRect.height + 25 + "px");
    // out.legendContainerBackground.style("width", out.legendBRect.width + 25 + "px");
    out.legendContainerBackground.style("height", "500").style("width", "500");
  }

  function addColorLegend() {
    //background container
    out.legendContainer = out.svg
      .append("g")
      .attr("id", "dorling-legend-container")
      //svg width - legendContainer width
      .attr("opacity", 0);

    out.legendContainerBackground = out.legendContainer
      .append("rect")
      .attr("class", "dorling-legend-container-background")
      .attr("transform", "translate(0,0)")

    //legend <g>
    out.legendContainer
      .append("g")
      .attr("class", "dorling-color-legend")
      .attr("transform", "translate(20,20)");

    let legend = legendColor()
      //.useClass(true)
      .title(out.colorLegend_.title)
      .titleWidth(out.colorLegend_.titleWidth)
      .orient(out.colorLegend_.orient)
      .shape(out.colorLegend_.shape)
      .shapePadding(out.colorLegend_.shapePadding)
      .labelAlign(out.colorLegend_.labelAlign)
      .labelOffset(out.colorLegend_.labelOffset)
      .labelFormat(out.colorLegend_.labelFormat)
      .scale(out.colorScale)
      .labelDelimiter(out.colorLegend_.labelDelimiter)
      .labelWrap(out.colorLegend_.labelWrap);
    if (out.colorLegend_.cells) {
      legend.cells(out.colorLegend_.cells);
    }
    if (out.colors_) {
      if (out.colorLegend_.labels) {
        legend.labels(out.colorLegend_.labels)
      } else {
        legend.labels(function (d) {
          if (d.i === 0)
            return (
              "< " +
              d.generatedLabels[d.i].split(d.labelDelimiter)[1] +
              out.colorLegend_.labelUnit
            );
          else if (d.i === d.genLength - 1)
            return (
              "≥ " +
              d.generatedLabels[d.i].split(d.labelDelimiter)[0] +
              out.colorLegend_.labelUnit
            );
          else return d.generatedLabels[d.i] + out.colorLegend_.labelUnit;
        });
      }
    } else {
      if (out.colorLegend_.labels) {
        legend.labels(out.colorLegend_.labels)
      }
    }

    if (out.colorLegend_.shape == "circle")
      legend.shapeRadius(out.colorLegend_.shapeRadius);

    out.svg.select(".dorling-color-legend").call(legend);

    //ajust position of legend container
    out.legendContainerNode = out.legendContainer.node();
    out.legendContainer.attr("transform", "translate(" + ((out.width_ - out.colorLegend_.titleWidth) - 35) + ", 0)");
  }
  function addSizeLegend() {
    //circle size legend
    // let brect = out.legendContainerNode.getBoundingClientRect();
    // out.sizeLegendTranslateY = brect.height;

    //assign default circle radiuses if none specified by user
    if (!out.sizeLegend_.values) {
      out.out.sizeLegend_.values = [Math.floor(out.sizeExtent[1]), Math.floor(out.sizeExtent[1] / 2), Math.floor(out.sizeExtent[1] / 10)]
    }

    out.sizeLegendContainer = out.legendContainer
      .append("g")
      .attr("id", "dorling-size-legend-container")
      .attr("transform", "translate(0," + out.sizeLegend_.translateY + ")")
      .attr("opacity", 0);
    let sizeLegendBackground = out.sizeLegendContainer
      .append("rect")
      .attr("id", "dorling-size-legend-container-background")
      .attr("transform", "translate(0,0)");
    const legendTitle = out.sizeLegendContainer
      .append("g")
      .attr("fill", "black")
      .attr("class", "dorling-size-legend-title")
      .attr("transform", "translate(" + out.sizeLegend_.titleXOffset + "," + out.sizeLegend_.titleYOffset + ")")
      .attr("text-anchor", "right");
    legendTitle
      .append("text")
      .attr("y", 5)
      .attr("x", 0)
      .attr("dy", "1.3em")
      .text(out.sizeLegend_.title);
    const legC = out.sizeLegendContainer
      .append("g")
      .attr("fill", "black")
      .attr("transform", "translate(40, 85)")
      .attr("text-anchor", "right")
      .selectAll("g")
      // .data([20e6, 10e6, 1e6])
      .data(out.sizeLegend_.values)
      .join("g");
    legC
      .append("circle")
      .attr("fill", "none")
      .attr("stroke", "black")
      .attr("cy", (d) => -toRadius(d))
      .attr("r", toRadius);
    legC
      .append("text")
      //.attr("y", (d) => 9 - 2 * toRadius(d))
      .attr("y", (d) => {
        if (d == 20e6) {
          return -1 - 2 * toRadius(d) - 10 - 4; //add padding
        } else {
          return -1 - 2 * toRadius(d) - 10;
        }
      })
      .attr("x", 30)
      .attr("dy", "1.3em")
      .text((d) => {
        return out.sizeLegend_.textFunction(d);
        //return d.toLocaleString("en").replace(/,/gi, " ");
      });
  }

  function addNutsSelectorToDOM() {
    let radioWidth = 30;
    let radioHeight = 30;
    let radioRadius = 8;
    let radioDotRadius = 6;
    let padding = 0;//vertical padding between radios
    let marginTop = 40;
    let marginLeft = 30;
    let radioCxy = 5;
    let backgroundHeight = 160;
    let radioDotOpacity = 0.3;

    out.nutsSelectorTranslateY = 330;
    //main container
    let sl = document.getElementById("dorling-size-legend-container")
    let slbr = sl.getBoundingClientRect();
    out.radioContainer = out.legendContainer
      .append("g")
      .attr("id", "dorling-nuts-selector")
      //.attr("class", "dorling-nuts-selector-container dorling-plugin")
      .attr("opacity", 0)
      .attr("transform", "translate(0, " + out.nutsSelectorTranslateY + ")")

    //background
    out.radioContainer
      .append("rect")
      .attr("class", "dorling-legend-container-background dorling-plugin")
    //.style("height", backgroundHeight)
    //.attr("transform", "translate(0,0)");

    //title
    out.radioContainer.append("text")
      .text("Geographic Level")
      .attr("transform", "translate(" + (marginLeft - 5) + ",20)");

    //RADIO 0
    let radio0 = out.radioContainer.append("g")
      .attr("fill", "currentColor")
      .attr("class", "dorling-radio-button")
      .attr("preserveAspectRatio", "xMidYMid meet")
      .attr("height", "" + radioHeight + "px")
      .attr("width", "" + radioWidth + "px")
      .attr("viewBox", "0 0 " + radioWidth + " " + radioHeight + "")
      .attr("transform", "translate(" + marginLeft + "," + marginTop + ")");

    radio0.append("circle")
      .attr("class", "dorling-radio-outline")
      .attr("cx", "" + radioCxy + "")
      .attr("cy", "" + radioCxy + "")
      .attr("r", "" + radioRadius + "")
      .attr("fill", "none")
      .attr("stroke", "black")
      .attr("stroke-width", "3")

    let dot0 = radio0.append("circle")
      .attr("opacity", radioDotOpacity)
      .attr("cx", "" + radioCxy + "")
      .attr("cy", "" + radioCxy + "")
      .attr("r", "" + radioDotRadius + "")
      .attr("class", "dorling-radio-dot")

    let label0 = radio0.append("text")
      .text("Country")
      .attr("transform", "translate(25,10)");

    //RADIO 1
    let radio1 = out.radioContainer.append("g")
      .attr("fill", "currentColor")
      .attr("class", "dorling-radio-button")
      .attr("preserveAspectRatio", "xMidYMid meet")
      .attr("height", "" + radioHeight + "px")
      .attr("width", "" + radioWidth + "px")
      .attr("viewBox", "0 0 " + radioWidth + " " + radioHeight + "")
      .attr("transform", "translate(" + marginLeft + "," + (radioHeight + padding + marginTop) + ")");

    radio1.append("circle")
      .attr("class", "dorling-radio-outline")
      .attr("cx", "" + radioCxy + "")
      .attr("cy", "" + radioCxy + "")
      .attr("r", "" + radioRadius + "")
      .attr("fill", "none")
      .attr("stroke", "black")
      .attr("stroke-width", "3")

    let dot1 = radio1.append("circle")
      .attr("opacity", radioDotOpacity)
      .attr("cx", "" + radioCxy + "")
      .attr("cy", "" + radioCxy + "")
      .attr("r", "" + radioDotRadius + "")
      .attr("class", "dorling-radio-dot")

    let label1 = radio1.append("text")
      .text("NUTS 1")
      .attr("transform", "translate(25,10)");

    //RADIO 2
    let radio2 = out.radioContainer.append("g")
      .attr("fill", "currentColor")
      .attr("class", "dorling-radio-button")
      .attr("preserveAspectRatio", "xMidYMid meet")
      .attr("height", "" + radioHeight + "px")
      .attr("width", "" + radioWidth + "px")
      .attr("viewBox", "0 0 " + radioWidth + " " + radioHeight + "")
      .attr("transform", "translate(" + marginLeft + "," + (radioHeight * 2 + padding * 2 + marginTop) + ")")

    radio2.append("circle")
      .attr("class", "dorling-radio-outline")
      .attr("cx", "" + radioCxy + "")
      .attr("cy", "" + radioCxy + "")
      .attr("r", "" + radioRadius + "")
      .attr("fill", "none")
      .attr("stroke", "black")
      .attr("stroke-width", "3")

    let dot2 = radio2.append("circle")
      .attr("opacity", radioDotOpacity)
      .attr("cx", "" + radioCxy + "")
      .attr("cy", "" + radioCxy + "")
      .attr("r", "" + radioDotRadius + "")
      .attr("class", "dorling-radio-dot")

    let label2 = radio2.append("text")
      .text("NUTS 2")
      .attr("transform", "translate(25,10)");

    //RADIO 3
    let radio3 = out.radioContainer.append("g")
      .attr("fill", "currentColor")
      .attr("class", "dorling-radio-button")
      .attr("preserveAspectRatio", "xMidYMid meet")
      .attr("height", "" + radioHeight + "px")
      .attr("width", "" + radioWidth + "px")
      .attr("viewBox", "0 0 " + radioWidth + " " + radioHeight + "")
      .attr("transform", "translate(" + marginLeft + "," + (radioHeight * 3 + padding * 3 + marginTop) + ")")

    radio3.append("circle")
      .attr("class", "dorling-radio-outline")
      .attr("cx", "" + radioCxy + "")
      .attr("cy", "" + radioCxy + "")
      .attr("r", "" + radioRadius + "")
      .attr("fill", "none")
      .attr("stroke", "black")
      .attr("stroke-width", "3")

    let dot3 = radio3.append("circle")
      .attr("opacity", radioDotOpacity)
      .attr("cx", "" + radioCxy + "")
      .attr("cy", "" + radioCxy + "")
      .attr("r", "" + radioDotRadius + "")
      .attr("class", "dorling-radio-dot")

    let label3 = radio3.append("text")
      .text("NUTS 3")
      .attr("transform", "translate(25,10)");

    //current nutsLevel
    if (out.nutsLevel_ == 0) {
      dot0.attr("opacity", "1");
    } else if (out.nutsLevel_ == 1) {
      dot1.attr("opacity", "1");
    } else if (out.nutsLevel_ == 2) {
      dot2.attr("opacity", "1");
    } else if (out.nutsLevel_ == 3) {
      dot3.attr("opacity", "1");
    }

    radio0.on("click", function (e) {
      dot0.attr("opacity", "1");
      dot1.attr("opacity", radioDotOpacity);
      dot2.attr("opacity", radioDotOpacity);
      dot3.attr("opacity", radioDotOpacity);
      nutsRadioEventHandler(0)
    });
    radio1.on("click", function (e) {
      dot0.attr("opacity", radioDotOpacity);
      dot1.attr("opacity", "1");
      dot2.attr("opacity", radioDotOpacity);
      dot3.attr("opacity", radioDotOpacity);
      nutsRadioEventHandler(1)
    });
    radio2.on("click", function (e) {
      dot0.attr("opacity", radioDotOpacity);
      dot1.attr("opacity", radioDotOpacity);
      dot2.attr("opacity", "1");
      dot3.attr("opacity", radioDotOpacity);
      nutsRadioEventHandler(2)
    });
    radio3.on("click", function (e) {
      dot0.attr("opacity", radioDotOpacity);
      dot1.attr("opacity", radioDotOpacity);
      dot2.attr("opacity", radioDotOpacity);
      dot3.attr("opacity", "1");
      nutsRadioEventHandler(3)
    });


    //HTML
    // let container = document.createElement("div");
    // container.classList.add("dorling-nuts-selector-container");
    // let title = document.createElement("div");
    // title.innerHTML = "Geographic level <br>"
    // title.style.marginBottom = "6px";
    // container.appendChild(title);
    // out.container_.node().appendChild(container);

    // //radios
    // //0
    // let radio0 = document.createElement("input");
    // radio0.type = "radio";
    // radio0.value = 0;
    // radio0.id = "dorling-nuts-radio0";
    // radio0.name = "dorling-nuts-radios";
    // if (out.nutsLevel_ == 0) radio0.checked = "true";
    // radio0.onclick = nutsRadioEventHandler;
    // let radio0Label = document.createElement("label");
    // radio0Label.for = "dorling-nuts-radio0";
    // radio0Label.innerHTML = "Country"
    // //1
    // let radio1 = document.createElement("input");
    // radio1.type = "radio";
    // radio1.value = 1;
    // radio1.id = "dorling-nuts-radio1";
    // radio1.name = "dorling-nuts-radios";
    // if (out.nutsLevel_ == 1) radio1.checked = "true";
    // radio1.onclick = nutsRadioEventHandler;
    // let radio1Label = document.createElement("label");
    // radio1Label.for = "dorling-nuts-radio1";
    // radio1Label.innerHTML = "NUTS 1"
    // //2
    // let radio2 = document.createElement("input");
    // radio2.type = "radio";
    // radio2.value = 2;
    // radio2.id = "dorling-nuts-radio2";
    // radio2.name = "dorling-nuts-radios";
    // if (out.nutsLevel_ == 2) radio2.checked = "true";
    // radio2.onclick = nutsRadioEventHandler;
    // let radio2Label = document.createElement("label");
    // radio2Label.for = "dorling-nuts-radio2";
    // radio2Label.innerHTML = "NUTS 2"
    // //3
    // let radio3 = document.createElement("input");
    // radio3.type = "radio";
    // radio3.value = 3;
    // radio3.id = "dorling-nuts-radio3";
    // radio3.name = "dorling-nuts-radios";
    // if (out.nutsLevel_ == 3) radio3.checked = "true";
    // radio3.onclick = nutsRadioEventHandler;
    // let radio3Label = document.createElement("label");
    // radio3Label.for = "dorling-nuts-radio3";
    // radio3Label.innerHTML = "NUTS 3"

    // container.appendChild(radio0);
    // container.appendChild(radio0Label);
    // container.appendChild(document.createElement('br'))
    // container.appendChild(radio1);
    // container.appendChild(radio1Label);
    // container.appendChild(document.createElement('br'))
    // container.appendChild(radio2);
    // container.appendChild(radio2Label);
    // container.appendChild(document.createElement('br'))
    // container.appendChild(radio3);
    // container.appendChild(radio3Label);
    // container.appendChild(document.createElement('br'))
  }



  function nutsRadioEventHandler(nuts) {
    // let nuts = evt.currentTarget.value;
    if (out.nutsLevel_ !== nuts) {
      out.nutsLevel_ = nuts;
      out.rebuild();
    }
  }

  function addPlayButtonToDOM() {
    let buttonContainer = out.svg
      .append("g")
      .attr("class", "dorling-play-button")
      .attr(
        "transform",
        "translate(" + ((out.width_ / 2) - 22) + "," + (out.height_ - 45) + ")"
      );
    let playBtn = buttonContainer.append("g").style("visibility", "hidden");
    let pauseBtn = buttonContainer.append("g").style("visibility", "visible");

    playBtn
      .append("rect")
      .attr("width", 39)
      .attr("height", 40)
      //.attr("rx", 4)
      .style("fill", out.playButtonFill_);
    playBtn
      .append("path")
      .attr("d", "M15 10 L15 40 L35 25 Z")
      .style("fill", "white")
      .attr(
        "transform",
        "translate(-5,-5)"
      )

    pauseBtn
      .append("rect")
      .attr("width", 39)
      .attr("height", 40)
      //.attr("rx", 4)
      .style("fill", out.playButtonFill_);
    pauseBtn
      .append("path")
      .attr("d", "M12,11 L23,11 23,40 12,40 M26,11 L37,11 37,40 26,40")
      .style("fill", "white")
      .attr(
        "transform",
        "translate(-5,-5)"
      )

    buttonContainer.on("mousedown", function () {
      out.playing = !out.playing;

      //change icon
      playBtn.style("visibility", out.playing ? "hidden" : "visible");
      pauseBtn.style("visibility", out.playing ? "visible" : "hidden");

      //continue animation or end simulation
      if (out.playing) {
        animate();
      }
    });

    return buttonContainer;
  }


  out.play = function () {
    animate();
  }
  out.pause = function () {
    out.playing = false;
  }

  function addTooltipToDOM() {
    return d3
      .select("body")
      .append("div")
      .attr("class", "dorling-tooltip")
      .text("");
  }

  function defineColorScale() {
    //return [0,1,2,3,...,nb-1]
    let getA = function (nb) {
      let a = [];
      for (let i = 0; i < nb; i++) a.push(i);
      return a;
    };
    if (out.colors_) {
      return d3
        .scaleThreshold()
        .domain(out.thresholdValues_)
        .range(out.colors_)
        .unknown("#ccc")
    } else {
      if (out.thresholdValues_) {
        return d3
          .scaleDiverging()
          .domain([out.colorExtent[0], 0, out.colorExtent[1]])
          .interpolator(d3[out.colorScheme_]);
        //.range();
      } else {
        //default
        return d3
          .scaleDivergingSymlog((t) => d3[out.colorScheme_](1 - t))
          .domain([out.colorExtent[0], out.colorExtent[1] / 2, out.colorExtent[1]])
          .nice();
      }
    }
  }

  function colorFunction(v) {
    let color = out.colorScale(v);
    return color;
  }

  function zoomed() {
    out.circles.attr("transform", d3.event.transform);
    out.countries.attr("transform", d3.event.transform);
    out.countryBorders.attr("transform", d3.event.transform);
    out.nuts.attr("transform", d3.event.transform);
    out.nutsBorders.attr("transform", d3.event.transform);
    //out.kosovo.attr("transform", d3.event.transform);
  }

  function toRadius(val) {
    return out.circleExaggerationFactor_ * 0.005 * Math.sqrt(val);
  }

  function addLoadingSpinnerToDOM() {
    out.spinner = document.createElement("div");
    out.spinner.classList.add("lds-ripple");
    let son1 = document.createElement("div");
    let son2 = document.createElement("div");
    out.spinner.appendChild(son1);
    out.spinner.appendChild(son2);
    out.container_.node().appendChild(out.spinner);
  }
  function showLoadingSpinner() {
    out.spinner.classList.remove("hide");
    out.spinner.classList.add("show");
  }
  function hideLoadingSpinner() {
    out.spinner.classList.remove("show");
    out.spinner.classList.add("hide");
  }

  return out;
}

function indexStat(data) {
  const arr = Object.entries(
    data.dimension.geo.category.index
  ).map(([key, val]) => ({ id: key, val: +data.value[val] || null }));
  const ind = {};
  for (let i = 0; i < arr.length; i++) ind[arr[i].id] = arr[i].val;
  return ind;
}

function getTotals(data) {
  //get total for each country
  let arr = Object.entries(data);
  let dataByCountry = Array.from(d3Array.group(arr, (d) => d[0][0] + d[0][1]));

  let result = {};
  dataByCountry.forEach((country) => {
    let countryTotal = 0;
    for (let i = 0; i < country[1].length; i++) {
      countryTotal = countryTotal + country[1][i][1];
    }
    result[country[0]] = countryTotal;
  });
  return result;
}

function getCountryNamesIndex() {
  return {
    BE: "Belgium",
    BG: "Bulgaria",
    CZ: "Czechia",
    DK: "Denmark",
    DE: "Germany",
    EE: "Estonia",
    IE: "Ireland",
    EL: "Greece",
    ES: "Spain",
    FR: "France",
    HR: "Croatia",
    IT: "Italy",
    CY: "Cyprus",
    LV: "Latvia",
    LT: "Lithuania",
    LU: "Luxembourg",
    HU: "Hungary",
    MT: "Malta",
    NL: "Netherlands",
    AT: "Austria",
    PL: "Poland",
    PT: "Portugal",
    RO: "Romania",
    SI: "Slovenia",
    SK: "Slovakia",
    FI: "Finland",
    SE: "Sweden",
    IS: "Iceland",
    LI: "Liechtenstein",
    NO: "Norway",
    CH: "Switzerland",
    ME: "Montenegro",
    MK: "North Macedonia",
    AL: "Albania",
    RS: "Serbia",
    TR: "Turkey",
    BA: "Bosnia and Herzegovina",
    XK: "Kosovo",
    UK: "United Kingdom"
  }
}


