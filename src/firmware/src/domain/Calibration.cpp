#include "domain/Calibration.hpp"

#include <cmath>
#include <cstdlib>
#include <string>

namespace micromouse::domain {

namespace {

constexpr std::array<CalibrationField, kCalibrationFieldCount> kFields{{
    {"eixo_ate_frente", &Calibration::axleToFrontMm, 60.0, 115.0, "mm"},
    {"largura_frente", &Calibration::frontWidthMm, 80.0, 130.0, "mm"},
    {"eixo_ate_tof_frente", &Calibration::axleToFrontTofMm, 60.0, 115.0, "mm"},
    {"largura_com_rodas", &Calibration::widthWithWheelsMm, 0.0, 150.0, "mm"},
    {"tof_lado_ao_centro", &Calibration::sideTofToCenterMm, 0.0, 75.0, "mm"},
    {"tof_lado_a_frente_do_eixo", &Calibration::sideTofAheadOfAxleMm, 0.0, 115.0, "mm"},
    {"escala_giro", &Calibration::gyroScale, 0.90, 1.20, "x"},
    {"freio_arco", &Calibration::arcBrakeDeg, 0.0, 20.0, "graus"},
    {"freio_pivo", &Calibration::pivotBrakeDeg, 0.0, 30.0, "graus"},
    {"modo_curva", &Calibration::turnMode, 0.0, 1.0, "0=arco 1=uma roda"},
    {"freio_uma_roda", &Calibration::oneWheelBrakeDeg, 0.0, 20.0, "graus"},
    {"autoajuste_freio", &Calibration::autoBrake, 0.0, 1.0, "0/1"},
    {"parada_frente", &Calibration::frontStopMm, 20.0, 90.0, "mm"},
    {"centralizar", &Calibration::centerOnWalls, 0.0, 1.0, "0/1"},
    {"tof_na_reta", &Calibration::tofInStraight, 0.0, 1.0, "0/1"},
    {"ganho_rumo", &Calibration::headingGain, 0.0, 3.0, "mm/grau"},
    {"cabo_frente_mm", &Calibration::cableAheadMm, 0.0, 30.0, "mm"},
    {"preset_cad", &Calibration::presetCad, 0.0, 1.0, "0/1"},
}};

}  // namespace

const std::array<CalibrationField, kCalibrationFieldCount>& calibrationFields() noexcept {
    return kFields;
}

CalibrationSet setCalibration(Calibration& calibration, std::string_view name,
                              std::string_view value) noexcept {
    for (const CalibrationField& field : kFields) {
        if (field.name != name) {
            continue;
        }
        if (value.empty() || value.size() > 24) {
            return CalibrationSet::NotANumber;
        }
        char text[32];
        std::size_t length = 0;
        for (const char c : value) {
            text[length++] = c == ',' ? '.' : c;  // aceita 7,5 e 7.5
        }
        text[length] = '\0';
        char* end = nullptr;
        const double number = std::strtod(text, &end);
        if (end == text || *end != '\0' || !std::isfinite(number)) {
            return CalibrationSet::NotANumber;
        }
        if (number < field.min || number > field.max) {
            return CalibrationSet::OutOfRange;
        }
        calibration.*(field.member) = number;
        if (field.member == &Calibration::presetCad) {
            // O preset troca os dois valores da frente; o que vier depois, na mesma linha, vale mais.
            const bool cad = number >= 0.5;
            calibration.axleToFrontMm = cad ? robot::kCadAxleToFrontMm : robot::kBody.axleToFrontMm;
            calibration.axleToFrontTofMm =
                cad ? robot::kCadAxleToFrontTofMm : robot::kBody.axleToFrontTofMm;
        }
        return CalibrationSet::Ok;
    }
    return CalibrationSet::UnknownName;
}

CalibrationParse applyCalibration(Calibration& calibration, std::string_view assignments) noexcept {
    Calibration draft = calibration;
    CalibrationParse result;
    std::size_t at = 0;
    while (at < assignments.size()) {
        while (at < assignments.size() && assignments[at] == ' ') {
            ++at;
        }
        std::size_t end = at;
        while (end < assignments.size() && assignments[end] != ' ') {
            ++end;
        }
        if (end == at) {
            break;
        }
        const std::string_view item = assignments.substr(at, end - at);
        at = end;
        const std::size_t equals = item.find('=');
        const CalibrationSet outcome =
            equals == std::string_view::npos
                ? CalibrationSet::UnknownName
                : setCalibration(draft, item.substr(0, equals), item.substr(equals + 1));
        if (outcome == CalibrationSet::Ok) {
            ++result.applied;
        } else {
            if (result.rejected == 0) {
                result.firstRejected = item;
                result.firstReason = outcome;
            }
            ++result.rejected;
        }
    }
    if (result.rejected == 0) {
        calibration = draft;
    } else {
        result.applied = 0;
    }
    return result;
}

double bodyVsCadGapMm(const Calibration& calibration) noexcept {
    return std::fmax(std::fabs(calibration.axleToFrontMm - robot::kCadAxleToFrontMm),
                     std::fabs(calibration.axleToFrontTofMm - robot::kCadAxleToFrontTofMm));
}

bool bodyConflictsWithCad(const Calibration& calibration) noexcept {
    return bodyVsCadGapMm(calibration) > robot::kBodyConflictMm;
}

int sanitizeCalibration(Calibration& calibration) noexcept {
    const Calibration defaults;
    int fixed = 0;
    for (const CalibrationField& field : kFields) {
        double& value = calibration.*(field.member);
        if (!std::isfinite(value) || value < field.min || value > field.max) {
            value = defaults.*(field.member);
            ++fixed;
        }
    }
    return fixed;
}

}  // namespace micromouse::domain
