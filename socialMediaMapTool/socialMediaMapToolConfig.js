/*
 * Copyright 2016 Esri
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *   http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

define([
  "dojo/_base/declare",
  "dojo/_base/lang",
  "dijit/_WidgetBase",
  "dijit/_TemplatedMixin",
  "esri/opsdashboard/MapToolConfigurationProxy",
  "dojo/text!./socialMediaMapToolConfigTemplate.html",
  "dijit/form/TextBox",
  "dijit/form/NumberTextBox",
  "dijit/form/Select",
  "dojo/number"
], function (declare, lang, _WidgetBase, _TemplatedMixin, MapToolConfigurationProxy, templateString, TextBox, NumberTextBox, Select, number) {

  return declare("SocialMediaMapToolConfig", [_WidgetBase, _TemplatedMixin, MapToolConfigurationProxy], {
    templateString: templateString,

    hostReady: function () {
      // If this.config has no properties, populate UI and the config object with the default values
      // Otherwise, populate the UI with properties from the config

      var defaultTags = "";
      var defaultRadius = 5;
      var defaultDate = 7;

      if (Object.keys(this.config).length === 0) {
        this.tagsField.value = defaultTags;
        this.radiusField.value = defaultRadius;
        this.radiusUnitField.selectedIndex = 0;
        this.dateField.value = defaultDate;
        this.dateUnitField.selectedIndex = 0;

        this.config = {
          "tags": defaultTags,
          "takenDate": {
            "value": defaultDate,
            "unit": this.dateUnitField.selectedIndex,
            "unitString": this.dateUnitField.value
          },
          "radius": {
            "value": defaultRadius,
            "unit": this.radiusUnitField.selectedIndex
          }
        };
      } else {
        this.tagsField.value = this.config.tags;
        this.radiusField.value = this.config.radius.value;
        this.radiusUnitField.selectedIndex = this.config.radius.unit;
        this.dateField.value = this.config.takenDate.value;
        this.dateUnitField.selectedIndex = this.config.takenDate.unit;

        this.readyToPersistConfig(true);
      }

      this.inherited(arguments);
    },

    tagsFieldChanged: function () {
      // Validate tags field is not empty

      if (this.tagsField.value === "") {
        this.readyToPersistConfig(false);
      }
      else {
        this.config.tags = this.tagsField.value;
        this.readyToPersistConfig(true);
      }
    },

    radiusInputChanged: function () {
      // Validate radius is within the acceptable range

      var radius = number.parse(this.radiusField.value);
      var radiusUnit = this.radiusUnitField.selectedIndex;
      var radiusUnitString = this.radiusUnitField.value;

      if (radius && radius > 0 && ((radiusUnitString == "km" && radius < 32) || (radiusUnitString == "mi" && radius < 20 ))) {
        this.config.radius = {
          "value": radius,
          "unit": radiusUnit,
          "unitString": radiusUnitString
        };
        this.readyToPersistConfig(true);
      }
      else
        this.readyToPersistConfig(false);
    },

    dateFieldChanged: function () {
      // Validate date value is valid

      var date = number.parse(this.dateField.value);
      if (!date || date <= 0)
        this.readyToPersistConfig(false);
      else {
        this.config.takenDate = {
          "value": date,
          "unit": this.dateUnitField.selectedIndex,
          "unitString": this.dateUnitField.value
        };
        console.log(this.config.takenDate.value + " " + this.config.takenDate.unitString + " ( " + this.config.takenDate.unit + " )")
        this.readyToPersistConfig(true);
      }
    }
  });
});